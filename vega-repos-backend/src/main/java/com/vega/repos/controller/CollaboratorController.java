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

    /** List pending collaborator requests. Owner or maintainer. */
    @GetMapping("/repos/{owner}/{repoName}/collaborators/requests")
    public ResponseEntity<List<CollaboratorRequestDto>> listRequests(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(collaboratorService.listPendingRequestsForRepo(owner, repoName));
    }

    /** Request access to a repo. Any authenticated user. */
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

    /**
     * Approve collaborator request. Owner or maintainer.
     * Optional body: {"role": "reader"|"developer"|"reviewer"|"maintainer"} — defaults to "reader".
     * Privilege guard: maintainer cannot grant "maintainer" or "owner" roles.
     */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/requests/{requestId}/approve")
    public ResponseEntity<Void> approveRequest(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable Long requestId,
            @RequestBody(required = false) Map<String, String> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        String role = body != null ? body.get("role") : null;
        // Maintainers cannot escalate someone to maintainer/owner
        if (!repoAccessService.isOwner(user, owner) && isMaintainerOrAbove(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        try {
            collaboratorService.approveRequest(requestId, owner, role);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Reject collaborator request. Owner or maintainer. */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/requests/{requestId}/reject")
    public ResponseEntity<Void> rejectRequest(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable Long requestId) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        try {
            collaboratorService.rejectRequest(requestId, owner);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** List collaborators. Owner or any collaborator with read access. */
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

    /**
     * Add collaborator. Owner or maintainer.
     * Privilege guard: maintainer cannot add someone as maintainer.
     */
    @PostMapping("/repos/{owner}/{repoName}/collaborators")
    public ResponseEntity<CollaboratorDto> addCollaborator(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @RequestBody Map<String, Object> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Object u = body.get("username");
        String username = (u != null) ? u.toString().trim() : null;
        boolean canCreatePr = body.get("canCreatePr") != null ? (Boolean) body.get("canCreatePr") : true;
        String role = body.get("role") != null ? body.get("role").toString() : "developer";
        if (username == null || username.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        // Maintainers cannot add someone at maintainer level or above
        if (!repoAccessService.isOwner(user, owner) && isMaintainerOrAbove(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        try {
            var col = collaboratorService.addCollaborator(owner, repoName, username, canCreatePr, role);
            return ResponseEntity.ok(col);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Update collaborator role. Owner or maintainer.
     * Privilege guard: maintainer cannot assign maintainer role or demote another maintainer.
     */
    @PatchMapping("/repos/{owner}/{repoName}/collaborators/{collaboratorUsername}/role")
    public ResponseEntity<CollaboratorDto> updateRole(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable String collaboratorUsername,
            @RequestBody Map<String, String> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        String role = body != null ? body.get("role") : null;
        if (role == null || role.isBlank()) return ResponseEntity.badRequest().build();
        if (!repoAccessService.isOwner(user, owner)) {
            // Maintainer cannot assign maintainer role
            if (isMaintainerOrAbove(role)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            // Maintainer cannot demote another maintainer
            String targetRole = repoAccessService.getCollaboratorRole(collaboratorUsername, owner, repoName);
            if ("maintainer".equals(targetRole)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }
        try {
            var col = collaboratorService.updateCollaboratorRole(owner, repoName, collaboratorUsername, role);
            return ResponseEntity.ok(col);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Remove collaborator. Owner or maintainer.
     * Privilege guard: maintainer cannot remove another maintainer.
     */
    @DeleteMapping("/repos/{owner}/{repoName}/collaborators/{collaboratorUsername}")
    public ResponseEntity<Void> removeCollaborator(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @PathVariable String collaboratorUsername) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        // Maintainer cannot remove another maintainer — only owner can
        if (!repoAccessService.isOwner(user, owner)) {
            String targetRole = repoAccessService.getCollaboratorRole(collaboratorUsername, owner, repoName);
            if ("maintainer".equals(targetRole)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }
        collaboratorService.removeCollaborator(owner, repoName, collaboratorUsername);
        return ResponseEntity.ok().build();
    }

    /** List all pending requests for current user (as owner or maintainer of their repos). */
    @GetMapping("/collaborator-requests")
    public ResponseEntity<List<CollaboratorRequestDto>> listMyPendingRequests(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(collaboratorService.listPendingRequestsForOwner(user));
    }

    /**
     * Owner or maintainer sends invite with a role.
     * Body: {"username": "alice", "role": "reader"|"developer"|"reviewer"|"maintainer"}.
     * Privilege guard: maintainer cannot invite someone as maintainer.
     */
    @PostMapping("/repos/{owner}/{repoName}/collaborators/invite")
    public ResponseEntity<CollaboratorRequestDto> inviteCollaborator(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName,
            @RequestBody Map<String, String> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        String invitee = body != null ? body.get("username") : null;
        if (invitee == null || invitee.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        String role = body != null ? body.get("role") : null;
        if (!repoAccessService.isOwner(user, owner) && isMaintainerOrAbove(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        try {
            var req = collaboratorService.inviteCollaborator(owner, repoName, invitee.trim(), role);
            return ResponseEntity.ok(req);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Pending invites for this repo. Owner or maintainer. */
    @GetMapping("/repos/{owner}/{repoName}/collaborators/pending-invites")
    public ResponseEntity<List<CollaboratorRequestDto>> listPendingInvites(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String owner, @PathVariable String repoName) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canManageCollaborators(user, owner, repoName)) {
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

    /** Returns true if role is "maintainer" or "owner" — used for privilege escalation checks. */
    private boolean isMaintainerOrAbove(String role) {
        return "maintainer".equals(role) || "owner".equals(role);
    }
}
