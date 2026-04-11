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
        if (existing.isPresent()) {
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

    /** Owner invites a user. Invitee must approve. */
    @Transactional
    public CollaboratorRequestDto inviteCollaborator(String ownerUsername, String repoName, String inviteeUsername) {
        if (ownerUsername.equals(inviteeUsername)) {
            throw new IllegalArgumentException("Cannot invite yourself");
        }
        if (collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                ownerUsername, repoName, inviteeUsername)) {
            throw new IllegalArgumentException("Already a collaborator");
        }
        var existing = requestRepository.findByOwnerUsernameAndRepoNameAndRequesterUsernameAndStatus(
                ownerUsername, repoName, inviteeUsername, Status.PENDING);
        if (existing.isPresent()) {
            throw new IllegalArgumentException("Invite already sent");
        }
        var req = CollaboratorRequest.builder()
                .requesterUsername(inviteeUsername)
                .ownerUsername(ownerUsername)
                .repoName(repoName)
                .status(Status.PENDING)
                .invitedByUsername(ownerUsername)
                .build();
        req = requestRepository.save(req);
        return toDto(req);
    }

    /** Invitee accepts the invite. */
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

        var col = RepoCollaborator.builder()
                .ownerUsername(req.getOwnerUsername())
                .repoName(req.getRepoName())
                .collaboratorUsername(req.getRequesterUsername())
                .canCreatePr(true)
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

    @Transactional
    public void approveRequest(Long requestId, String ownerUsername) {
        var req = requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Request not found"));
        if (!req.getOwnerUsername().equals(ownerUsername)) {
            throw new IllegalArgumentException("Only owner can approve");
        }
        if (req.getStatus() != Status.PENDING) {
            throw new IllegalArgumentException("Request already processed");
        }
        req.setStatus(Status.APPROVED);
        req.setRespondedAt(Instant.now());
        requestRepository.save(req);

        var col = RepoCollaborator.builder()
                .ownerUsername(req.getOwnerUsername())
                .repoName(req.getRepoName())
                .collaboratorUsername(req.getRequesterUsername())
                .canCreatePr(true)
                .build();
        collaboratorRepository.save(col);
    }

    @Transactional
    public void rejectRequest(Long requestId, String ownerUsername) {
        var req = requestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Request not found"));
        if (!req.getOwnerUsername().equals(ownerUsername)) {
            throw new IllegalArgumentException("Only owner can reject");
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
        String resolvedRole = (role != null && (role.equals("developer") || role.equals("reviewer"))) ? role : "developer";
        var col = RepoCollaborator.builder()
                .ownerUsername(ownerUsername)
                .repoName(repoName)
                .collaboratorUsername(collaboratorUsername)
                .canCreatePr(canCreatePr)
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
        String resolvedRole = (role != null && (role.equals("developer") || role.equals("reviewer"))) ? role : "developer";
        col.setRole(resolvedRole);
        col = collaboratorRepository.save(col);
        return toDto(col);
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
                .createdAt(r.getCreatedAt())
                .build();
    }
}
