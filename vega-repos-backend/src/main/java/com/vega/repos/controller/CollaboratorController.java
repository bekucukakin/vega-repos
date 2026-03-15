package com.vega.repos.controller;

import com.vega.repos.dto.CollaboratorDto;
import com.vega.repos.dto.CollaboratorRequestDto;
import com.vega.repos.service.CollaboratorService;
import com.vega.repos.service.RepoAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class CollaboratorController {

    private final CollaboratorService collaboratorService;
    private final RepoAccessService repoAccessService;

    public CollaboratorController(CollaboratorService collaboratorService,
                                 RepoAccessService repoAccessService) {
        this.collaboratorService = collaboratorService;
        this.repoAccessService = repoAccessService;
    }

    /** List pending collaborator requests (for repo owner). Requires Auth. */
    @GetMapping("/repos/{owner}/{repoName}/collaborators/requests")
    public ResponseEntity<List<CollaboratorRequestDto>> listRequests(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(collaboratorService.listPendingRequestsForRepo(owner, repoName));
    }

    /** Request access to a repo as collaborator. Requires Auth. */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/request")
    public ResponseEntity<CollaboratorRequestDto> requestAccess(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @RequestBody(required = false) Map<String, String> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String message = body != null ? body.get("message") : null;
        try {
            var req = collaboratorService.requestAccess(user, owner, repoName, message);
            return ResponseEntity.ok(req);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Approve collaborator request. Owner only. */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/requests/{requestId}/approve")
    public ResponseEntity<Void> approveRequest(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable Long requestId) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        try {
            collaboratorService.approveRequest(requestId, owner);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Reject collaborator request. Owner only. */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/requests/{requestId}/reject")
    public ResponseEntity<Void> rejectRequest(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable Long requestId) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        try {
            collaboratorService.rejectRequest(requestId, owner);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** List collaborators. Owner or collaborator. */
    @GetMapping("/repos/{owner}/{repoName}/collaborators")
    public ResponseEntity<List<CollaboratorDto>> listCollaborators(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(collaboratorService.listCollaborators(owner, repoName));
    }

    /** Add collaborator. Owner only. */
    @PostMapping("/repos/{owner}/{repoName}/collaborators")
    public ResponseEntity<CollaboratorDto> addCollaborator(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @RequestBody Map<String, Object> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Object u = body.get("username");
        String username = (u != null && u.toString() != null) ? u.toString().trim() : null;
        boolean canCreatePr = body.get("canCreatePr") != null ? (Boolean) body.get("canCreatePr") : true;
        if (username == null || username.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            var col = collaboratorService.addCollaborator(owner, repoName, username, canCreatePr);
            return ResponseEntity.ok(col);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Remove collaborator. Owner only. */
    @DeleteMapping("/repos/{owner}/{repoName}/collaborators/{collaboratorUsername}")
    public ResponseEntity<Void> removeCollaborator(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable String collaboratorUsername) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        collaboratorService.removeCollaborator(owner, repoName, collaboratorUsername);
        return ResponseEntity.ok().build();
    }

    /** List all pending requests for current user (as owner). */
    @GetMapping("/collaborator-requests")
    public ResponseEntity<List<CollaboratorRequestDto>> listMyPendingRequests(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(collaboratorService.listPendingRequestsForOwner(user));
    }

    /** Owner sends invite. Creates pending invite; invitee must approve. */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/invite")
    public ResponseEntity<CollaboratorRequestDto> inviteCollaborator(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @RequestBody Map<String, String> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        String invitee = body != null ? body.get("username") : null;
        if (invitee == null || invitee.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            var req = collaboratorService.inviteCollaborator(owner, repoName, invitee.trim());
            return ResponseEntity.ok(req);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Pending invites for this repo (owner view). */
    @GetMapping("/repos/{owner}/{repoName}/collaborators/pending-invites")
    public ResponseEntity<List<CollaboratorRequestDto>> listPendingInvites(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(user, owner)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(collaboratorService.listPendingInvitesForRepo(owner, repoName));
    }

    /** Pending invites TO current user. */
    @GetMapping("/collaborator-invites")
    public ResponseEntity<List<CollaboratorRequestDto>> listMyInvites(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(collaboratorService.listPendingInvitesForUser(user));
    }

    /** Accept invite. Invitee only. */
    @PostMapping("/collaborator-invites/{requestId}/accept")
    public ResponseEntity<Void> acceptInvite(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long requestId) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        try {
            collaboratorService.acceptInvite(requestId, user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Reject invite. Invitee only. */
    @PostMapping("/collaborator-invites/{requestId}/reject")
    public ResponseEntity<Void> rejectInvite(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long requestId) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        try {
            collaboratorService.rejectInvite(requestId, user);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
