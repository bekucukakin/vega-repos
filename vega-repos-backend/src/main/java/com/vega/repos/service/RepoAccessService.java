package com.vega.repos.service;

import com.vega.repos.entity.RepoCollaborator;
import com.vega.repos.repository.RepoCollaboratorRepository;
import com.vega.repos.repository.RepoSettingsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Resolves current user from JWT and checks repo access.
 * Public repos: everyone can read (view code, branches, PRs).
 * Private repos: only owner or collaborator can access.
 */
@Service
public class RepoAccessService {

    private static final Logger log = LoggerFactory.getLogger(RepoAccessService.class);

    private final RestTemplate restTemplate;
    private final RepoCollaboratorRepository collaboratorRepository;
    private final RepoSettingsRepository repoSettingsRepository;
    private final UserServiceJwtParser userServiceJwtParser;

    @Value("${vega.user-service.url:http://localhost:8085}")
    private String userServiceUrl;

    public RepoAccessService(RestTemplate restTemplate,
                             RepoCollaboratorRepository collaboratorRepository,
                             RepoSettingsRepository repoSettingsRepository,
                             UserServiceJwtParser userServiceJwtParser) {
        this.restTemplate = restTemplate;
        this.collaboratorRepository = collaboratorRepository;
        this.repoSettingsRepository = repoSettingsRepository;
        this.userServiceJwtParser = userServiceJwtParser;
    }

    public String resolveUsername(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) return null;
        String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        if (token.isBlank()) return null;

        String fromJwt = userServiceJwtParser.extractUsername(token);
        if (fromJwt != null && !fromJwt.isBlank()) {
            return fromJwt;
        }

        try {
            String url = userServiceUrl + "/api/auth/username";
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody().replaceAll("^\"|\"$", "").trim();
            }
        } catch (Exception e) {
            log.warn("Could not resolve username from user-service (JWT parse also failed): {}", e.getMessage());
        }
        return null;
    }

    /**
     * Check if user can access (read) a repo.
     * Public repos: any authenticated user can read.
     * Private repos: only owner or collaborator.
     */
    public boolean canAccess(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        if (repoSettingsRepository.existsByOwnerUsernameAndRepoNameAndIsPublicTrue(ownerUsername, repoName)) {
            return true;
        }
        return collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, currentUser);
    }

    /**
     * Check if user can write (push to protected branches, approve/merge PRs).
     * Owner always can. Collaborators with canCreatePr=true can.
     * Public repo non-collaborators can only create branches and PRs, not push to main/master.
     */
    public boolean canCreateOrApprovePr(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        return collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                        ownerUsername, repoName, currentUser)
                .map(RepoCollaborator::getCanCreatePr)
                .orElse(false);
    }

    /**
     * Returns the role of the user in the repo:
     * "owner", "maintainer", "developer", "reviewer", "reader", or null (no access).
     */
    public String getCollaboratorRole(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return null;
        if (currentUser.equals(ownerUsername)) return "owner";
        return collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                        ownerUsername, repoName, currentUser)
                .map(c -> c.getRole() != null ? c.getRole() : "developer")
                .orElse(null);
    }

    /**
     * Can the user CREATE a PR?
     * Owner and maintainer always can.
     * Developer can if canCreatePr=true.
     * Reviewer and reader cannot — read-only roles.
     */
    public boolean canCreatePrInRepo(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        return collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                        ownerUsername, repoName, currentUser)
                .map(c -> {
                    String r = c.getRole();
                    if ("maintainer".equals(r)) return true;
                    return "developer".equals(r) && Boolean.TRUE.equals(c.getCanCreatePr());
                })
                .orElse(false);
    }

    /**
     * Can the user APPROVE/REJECT a PR?
     * Owner, maintainer, and reviewer. Developers and readers cannot approve.
     * Self-approval is blocked at the service level (author check in updatePrStatus).
     */
    public boolean canApprovePrInRepo(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        return collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                        ownerUsername, repoName, currentUser)
                .map(c -> "reviewer".equals(c.getRole()) || "maintainer".equals(c.getRole()))
                .orElse(false);
    }

    /**
     * Can the user MERGE a PR?
     * Owner, maintainer, and developer can merge.
     * Reviewer and reader cannot — merging is a write operation.
     * Self-merge of own unapproved PR is blocked at call site.
     */
    public boolean canMergePrInRepo(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        String role = getCollaboratorRole(currentUser, ownerUsername, repoName);
        return "developer".equals(role) || "maintainer".equals(role);
    }

    /**
     * Can this user push to a protected branch (main/master)?
     * Owner, maintainer, and developer can push.
     * Reviewer and reader have read-only access.
     */
    public boolean canPushToProtectedBranch(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        String role = getCollaboratorRole(currentUser, ownerUsername, repoName);
        return "developer".equals(role) || "maintainer".equals(role);
    }

    /**
     * Can this user push to a feature (non-protected) branch?
     * Owner, maintainer, and developer can push.
     * Reviewer and reader have read-only access.
     * Public visibility means read/clone access, not write.
     */
    public boolean canPushToFeatureBranch(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        String role = getCollaboratorRole(currentUser, ownerUsername, repoName);
        return "developer".equals(role) || "maintainer".equals(role);
    }

    /**
     * Can this user manage collaborators (invite, add, update roles, remove)?
     * Owner always can. Maintainer can manage collaborators but cannot escalate to owner/maintainer.
     * That privilege-escalation guard is enforced at the controller level.
     */
    public boolean canManageCollaborators(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        String role = getCollaboratorRole(currentUser, ownerUsername, repoName);
        return "maintainer".equals(role);
    }

    /**
     * Can this user change repo settings (visibility, description)?
     * Owner always can. Maintainer can change settings but cannot delete the repo.
     */
    public boolean canChangeRepoSettings(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        String role = getCollaboratorRole(currentUser, ownerUsername, repoName);
        return "maintainer".equals(role);
    }

    public boolean isOwner(String currentUser, String ownerUsername) {
        return currentUser != null && currentUser.equals(ownerUsername);
    }

    /**
     * Can {@code viewer} see metrics for {@code targetUsername}?
     * Rules:
     *   1. A user can always view their own metrics.
     *   2. A user can view another's metrics if they own at least one repo
     *      where that user is a collaborator (i.e., they are the repo owner/maintainer
     *      who has granted the target access).
     */
    public boolean canViewUserMetrics(String viewer, String targetUsername) {
        if (viewer == null || targetUsername == null) return false;
        if (viewer.equalsIgnoreCase(targetUsername)) return true;
        return collaboratorRepository.existsByOwnerUsernameAndCollaboratorUsername(viewer, targetUsername);
    }
}
