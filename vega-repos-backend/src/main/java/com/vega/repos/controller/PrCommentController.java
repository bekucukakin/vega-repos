package com.vega.repos.controller;

import com.vega.repos.dto.PrCommentDto;
import com.vega.repos.service.PrCommentService;
import com.vega.repos.service.RepoAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/repos/{ownerUsername}/{repoName}/pull-requests/{prId}/comments")
public class PrCommentController {

    private final PrCommentService commentService;
    private final RepoAccessService repoAccessService;

    public PrCommentController(PrCommentService commentService, RepoAccessService repoAccessService) {
        this.commentService = commentService;
        this.repoAccessService = repoAccessService;
    }

    @GetMapping
    public ResponseEntity<List<PrCommentDto>> listComments(
            @PathVariable String ownerUsername,
            @PathVariable String repoName,
            @PathVariable String prId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        if (repoAccessService.resolveUsername(auth) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(commentService.getComments(ownerUsername, repoName, prId));
    }

    @PostMapping
    public ResponseEntity<PrCommentDto> addComment(
            @PathVariable String ownerUsername,
            @PathVariable String repoName,
            @PathVariable String prId,
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        String author = repoAccessService.resolveUsername(auth);
        if (author == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String content = body.containsKey("content") ? String.valueOf(body.get("content")).strip() : "";
        if (content.isEmpty()) return ResponseEntity.badRequest().build();

        String filePath = body.containsKey("filePath") ? String.valueOf(body.get("filePath")) : null;
        Integer lineNumber = body.containsKey("lineNumber") && body.get("lineNumber") != null
                ? ((Number) body.get("lineNumber")).intValue() : null;
        Long parentId = body.containsKey("parentCommentId") && body.get("parentCommentId") != null
                ? ((Number) body.get("parentCommentId")).longValue() : null;

        PrCommentDto created = commentService.addComment(
                ownerUsername, repoName, prId, author, content, filePath, lineNumber, parentId);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Void> deleteComment(
            @PathVariable String ownerUsername,
            @PathVariable String repoName,
            @PathVariable String prId,
            @PathVariable Long commentId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String requester = repoAccessService.resolveUsername(auth);
        if (requester == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        boolean ok = commentService.deleteComment(commentId, requester);
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
}
