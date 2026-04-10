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
     * Can this user push to a protected branch (main/master)?
     * Only owner or collaborator. Public repos: non-collaborators must use branches + PR flow.
     */
    public boolean canPushToProtectedBranch(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        return collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, currentUser);
    }

    /**
     * Can this user push to any branch (non-protected) in a public repo?
     * Any authenticated user can push to feature branches in public repos.
     */
    public boolean canPushToFeatureBranch(String currentUser, String ownerUsername, String repoName) {
        if (currentUser == null) return false;
        if (currentUser.equals(ownerUsername)) return true;
        if (collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, currentUser)) return true;
        return repoSettingsRepository.existsByOwnerUsernameAndRepoNameAndIsPublicTrue(ownerUsername, repoName);
    }

    public boolean isOwner(String currentUser, String ownerUsername) {
        return currentUser != null && currentUser.equals(ownerUsername);
    }
}
