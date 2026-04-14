package com.vega.repos.service;

import com.vega.repos.dto.CollaboratorDto;
import com.vega.repos.dto.CollaboratorRequestDto;
import com.vega.repos.entity.CollaboratorRequest;
import com.vega.repos.entity.CollaboratorRequest.Status;
import com.vega.repos.entity.RepoCollaborator;
import com.vega.repos.repository.CollaboratorRequestRepository;
import com.vega.repos.repository.RepoCollaboratorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class CollaboratorService {

    private final RepoCollaboratorRepository collaboratorRepository;
    private final CollaboratorRequestRepository requestRepository;

    public CollaboratorService(RepoCollaboratorRepository collaboratorRepository,
                              CollaboratorRequestRepository requestRepository) {
        this.collaboratorRepository = collaboratorRepository;
        this.requestRepository = requestRepository;
    }

    @Transactional
    public CollaboratorRequestDto requestAccess(String requesterUsername, String ownerUsername,
                                                String repoName, String message) {
        if (requesterUsername.equals(ownerUsername)) {
            throw new IllegalArgumentException("Owner cannot request access to own repo");
        }
        if (collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, requesterUsername)) {
            throw new IllegalArgumentException("Already a collaborator");
        }
        var existing = requestRepository.findByOwnerUsernameAndRepoNameAndRequesterUsernameAndStatus(
                ownerUsername, repoName, requesterUsername, Status.PENDING);
        // Only block if there is already a pending ACCESS REQUEST (not an invite from the owner)
        if (existing.isPresent() && existing.get().getInvitedByUsername() == null) {
            throw new IllegalArgumentException("Request already pending");
        }
        var req = CollaboratorRequest.builder()
                .requesterUsername(requesterUsername)
                .ownerUsername(ownerUsername)
                .repoName(repoName)
                .status(Status.PENDING)
                .message(message)
                .invitedByUsername(null)
                .build();
        req = requestRepository.save(req);
        return toDto(req);
    }

    /** Owner invites a user with a specific role. Invitee must approve. */
    @Transactional
    public CollaboratorRequestDto inviteCollaborator(String ownerUsername, String repoName,
                                                     String inviteeUsername, String role) {
        if (ownerUsername.equals(inviteeUsername)) {
            throw new IllegalArgumentException("Cannot invite yourself");
        }
        if (collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, inviteeUsername)) {
            throw new IllegalArgumentException("Already a collaborator");
        }
        var existing = requestRepository.findByOwnerUsernameAndRepoNameAndRequesterUsernameAndStatus(
                ownerUsername, repoName, inviteeUsername, Status.PENDING);
        // Only block if there is already a pending INVITE (not an access request from the invitee)
        if (existing.isPresent() && existing.get().getInvitedByUsername() != null) {
            throw new IllegalArgumentException("Invite already pending");
        }
        var req = CollaboratorRequest.builder()
                .requesterUsername(inviteeUsername)
                .ownerUsername(ownerUsername)
                .repoName(repoName)
                .status(Status.PENDING)
                .invitedByUsername(ownerUsername)
                .role(resolveRole(role))
                .build();
        req = requestRepository.save(req);
        return toDto(req);
    }

    /** Invitee accepts the invite. The role is whatever the owner specified at invite time. */
    @Transactional
    public void acceptInvite(Long requestId, String currentUsername) {
        var req = requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Invite not found"));
        if (req.getInvitedByUsername() == null) {
            throw new IllegalArgumentException("Not an invite (use approve for requests)");
        }
        if (!req.getRequesterUsername().equals(currentUsername)) {
            throw new IllegalArgumentException("Only the invited user can accept");
        }
        if (req.getStatus() != Status.PENDING) {
            throw new IllegalArgumentException("Invite already processed");
        }
        req.setStatus(Status.APPROVED);
        req.setRespondedAt(Instant.now());
        requestRepository.save(req);

        String role = resolveRole(req.getRole());
        var col = RepoCollaborator.builder()
                .ownerUsername(req.getOwnerUsername())
                .repoName(req.getRepoName())
                .collaboratorUsername(req.getRequesterUsername())
                .canCreatePr("developer".equals(role) || "maintainer".equals(role))
                .role(role)
                .build();
        collaboratorRepository.save(col);
    }

    /** Reject invite. Invitee only. */
    @Transactional
    public void rejectInvite(Long requestId, String currentUsername) {
        var req = requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Invite not found"));
        if (req.getInvitedByUsername() == null) {
            throw new IllegalArgumentException("Not an invite");
        }
        if (!req.getRequesterUsername().equals(currentUsername)) {
            throw new IllegalArgumentException("Only the invited user can reject");
        }
        if (req.getStatus() != Status.PENDING) {
            throw new IllegalArgumentException("Invite already processed");
        }
        req.setStatus(Status.REJECTED);
        req.setRespondedAt(Instant.now());
        requestRepository.save(req);
    }

    /**
     * Owner approves an access request. The granted role defaults to "reader" (safe minimum)
     * unless the owner explicitly specifies a different role.
     */
    @Transactional
    public void approveRequest(Long requestId, String ownerUsername, String role) {
        var req = requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Request not found"));
        if (!req.getOwnerUsername().equals(ownerUsername)) {
            throw new IllegalArgumentException("Request does not belong to this repository");
        }
        if (req.getStatus() != Status.PENDING) {
            throw new IllegalArgumentException("Request already processed");
        }
        String grantedRole = resolveRole(role != null ? role : req.getRole());
        req.setStatus(Status.APPROVED);
        req.setRespondedAt(Instant.now());
        requestRepository.save(req);

        var col = RepoCollaborator.builder()
                .ownerUsername(req.getOwnerUsername())
                .repoName(req.getRepoName())
                .collaboratorUsername(req.getRequesterUsername())
                .canCreatePr("developer".equals(grantedRole) || "maintainer".equals(grantedRole))
                .role(grantedRole)
                .build();
        collaboratorRepository.save(col);
    }

    @Transactional
    public void rejectRequest(Long requestId, String ownerUsername) {
        var req = requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Request not found"));
        if (!req.getOwnerUsername().equals(ownerUsername)) {
            throw new IllegalArgumentException("Request does not belong to this repository");
        }
        if (req.getStatus() != Status.PENDING) {
            throw new IllegalArgumentException("Request already processed");
        }
        req.setStatus(Status.REJECTED);
        req.setRespondedAt(Instant.now());
        requestRepository.save(req);
    }

    /** Pending requests TO owner (others requested access - owner approves). */
    public List<CollaboratorRequestDto> listPendingRequestsForOwner(String ownerUsername) {
        return requestRepository.findByOwnerUsernameAndStatus(ownerUsername, Status.PENDING)
                .stream()
                .filter(r -> r.getInvitedByUsername() == null)
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    /** Pending invites TO current user (owner invited them - they approve). */
    public List<CollaboratorRequestDto> listPendingInvitesForUser(String username) {
        return requestRepository.findByRequesterUsernameAndInvitedByUsernameIsNotNullAndStatus(
                        username, Status.PENDING)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    /** Pending invites sent by owner for this repo. */
    public List<CollaboratorRequestDto> listPendingInvitesForRepo(String ownerUsername, String repoName) {
        return requestRepository.findByOwnerUsernameAndRepoNameAndInvitedByUsernameIsNotNullAndStatus(
                        ownerUsername, repoName, Status.PENDING)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<CollaboratorRequestDto> listPendingRequestsForRepo(String ownerUsername, String repoName) {
        return requestRepository.findByOwnerUsernameAndRepoNameAndStatus(
                        ownerUsername, repoName, Status.PENDING)
                .stream()
                .filter(r -> r.getInvitedByUsername() == null)
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public CollaboratorDto addCollaborator(String ownerUsername, String repoName,
                                           String collaboratorUsername, boolean canCreatePr) {
        return addCollaborator(ownerUsername, repoName, collaboratorUsername, canCreatePr, "developer");
    }

    @Transactional
    public CollaboratorDto addCollaborator(String ownerUsername, String repoName,
                                           String collaboratorUsername, boolean canCreatePr, String role) {
        if (ownerUsername.equals(collaboratorUsername)) {
            throw new IllegalArgumentException("Cannot add owner as collaborator");
        }
        if (collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, collaboratorUsername)) {
            throw new IllegalArgumentException("Already a collaborator");
        }
        String resolvedRole = resolveRole(role);
        // Only developers respect the canCreatePr flag; maintainers always have it; reader/reviewer never get it
        boolean effectiveCanCreatePr = "maintainer".equals(resolvedRole)
                || ("developer".equals(resolvedRole) && canCreatePr);
        var col = RepoCollaborator.builder()
                .ownerUsername(ownerUsername)
                .repoName(repoName)
                .collaboratorUsername(collaboratorUsername)
                .canCreatePr(effectiveCanCreatePr)
                .role(resolvedRole)
                .build();
        col = collaboratorRepository.save(col);
        return toDto(col);
    }

    @Transactional
    public CollaboratorDto updateCollaboratorRole(String ownerUsername, String repoName,
                                                   String collaboratorUsername, String role) {
        var col = collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, collaboratorUsername)
                .orElseThrow(() -> new IllegalArgumentException("Collaborator not found"));
        String resolvedRole = resolveRole(role);
        col.setRole(resolvedRole);
        // Sync canCreatePr with the new role automatically
        if ("maintainer".equals(resolvedRole) || "developer".equals(resolvedRole)) {
            col.setCanCreatePr(true);
        } else {
            // reader and reviewer: read-only, never get create-PR permission
            col.setCanCreatePr(false);
        }
        col = collaboratorRepository.save(col);
        return toDto(col);
    }

    /**
     * Normalizes a role string. Valid values: "reader", "developer", "reviewer", "maintainer".
     * Falls back to "reader" (safest default) for any unknown/null input.
     */
    private String resolveRole(String role) {
        if ("developer".equals(role) || "reviewer".equals(role)
                || "reader".equals(role) || "maintainer".equals(role)) {
            return role;
        }
        return "reader";
    }

    public List<CollaboratorDto> listCollaborators(String ownerUsername, String repoName) {
        return collaboratorRepository.findByOwnerUsernameAndRepoName(ownerUsername, repoName)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public void removeCollaborator(String ownerUsername, String repoName, String collaboratorUsername) {
        collaboratorRepository.deleteByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, collaboratorUsername);
    }

    private CollaboratorDto toDto(RepoCollaborator c) {
        return CollaboratorDto.builder()
                .id(c.getId())
                .username(c.getCollaboratorUsername())
                .canCreatePr(c.getCanCreatePr() != null && c.getCanCreatePr())
                .role(c.getRole() != null ? c.getRole() : "developer")
                .build();
    }

    private CollaboratorRequestDto toDto(CollaboratorRequest r) {
        return CollaboratorRequestDto.builder()
                .id(r.getId())
                .requesterUsername(r.getRequesterUsername())
                .ownerUsername(r.getOwnerUsername())
                .repoName(r.getRepoName())
                .status(r.getStatus().name())
                .message(r.getMessage())
                .invitedByUsername(r.getInvitedByUsername())
                .role(r.getRole() != null ? r.getRole() : "reader")
                .createdAt(r.getCreatedAt())
                .build();
    }
}
