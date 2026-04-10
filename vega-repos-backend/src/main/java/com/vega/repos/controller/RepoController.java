package com.vega.repos.controller;

import com.vega.repos.dto.BranchDto;
import com.vega.repos.dto.CommitDiffDto;
import com.vega.repos.dto.CommitDto;
import com.vega.repos.dto.FileContentDto;
import com.vega.repos.dto.FileTreeNodeDto;
import com.vega.repos.dto.PrDto;
import com.vega.repos.dto.RepoDto;
import com.vega.repos.service.MetricsService;
import com.vega.repos.service.RepoAccessService;
import com.vega.repos.service.RepoDownloadService;
import com.vega.repos.service.RepoFileService;
import com.vega.repos.service.RepoService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/repos")
public class RepoController {

    private final RepoService repoService;
    private final RepoDownloadService repoDownloadService;
    private final RepoFileService repoFileService;
    private final RepoAccessService repoAccessService;
    private final MetricsService metricsService;

    @Value("${vega.agent-service.url:http://localhost:8084}")
    private String agentServiceUrl;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public RepoController(RepoService repoService, RepoDownloadService repoDownloadService,
                          RepoFileService repoFileService, RepoAccessService repoAccessService,
                          MetricsService metricsService) {
        this.repoService = repoService;
        this.repoDownloadService = repoDownloadService;
        this.repoFileService = repoFileService;
        this.repoAccessService = repoAccessService;
        this.metricsService = metricsService;
    }

    /** List repos for current user (own + collaborator). Requires Auth. */
    @GetMapping("/me")
    public ResponseEntity<List<RepoDto>> listMyRepos(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(repoService.listRepositoriesForUser(user));
    }

    /**
     * Search all repos visible to the current user.
     * Public repos are visible to everyone. Private repos only to owner/collaborators.
     * Supports query parameter ?q= for fuzzy matching on name, owner, description.
     */
    @GetMapping("/search")
    public ResponseEntity<List<RepoDto>> searchRepos(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(value = "q", required = false, defaultValue = "") String query) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(repoService.searchRepositories(query, currentUser));
    }

    /** Set repo visibility (public/private). Owner only. */
    @PostMapping("/{username}/{repoName}/settings")
    public ResponseEntity<Void> updateRepoSettings(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @RequestBody Map<String, Object> body) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.isOwner(currentUser, username)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Boolean isPublic = body.containsKey("isPublic") ? (Boolean) body.get("isPublic") : null;
        String description = body.containsKey("description") ? (String) body.get("description") : null;
        if (isPublic != null) {
            repoService.setRepoVisibility(username, repoName, isPublic, description);
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{username}")
    public ResponseEntity<List<RepoDto>> listRepos(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null || !currentUser.equals(username)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        List<RepoDto> repos = repoService.listRepositoriesForUser(username);
        return ResponseEntity.ok(repos);
    }

    @GetMapping("/{username}/{repoName}")
    public ResponseEntity<RepoDto> getRepoDetail(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        RepoDto repo = repoService.getRepoDetail(username, repoName);
        if (repo == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(repo);
    }

    @GetMapping("/{username}/{repoName}/branches")
    public ResponseEntity<List<BranchDto>> getBranches(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(repoService.getBranches(username, repoName));
    }

    @GetMapping("/{username}/{repoName}/pull-requests")
    public ResponseEntity<List<PrDto>> getPullRequests(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(repoService.getPullRequests(username, repoName));
    }

    @GetMapping("/{username}/{repoName}/pull-requests/{prId}")
    public ResponseEntity<PrDto> getPullRequest(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName, @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        PrDto pr = repoService.getPullRequest(username, repoName, prId);
        if (pr == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(pr);
    }

    @GetMapping("/{username}/{repoName}/pull-requests/{prId}/diff")
    public ResponseEntity<CommitDiffDto> getPrDiff(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName, @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        PrDto pr = repoService.getPullRequest(username, repoName, prId);
        if (pr == null) return ResponseEntity.notFound().build();
        CommitDiffDto diff = repoService.getPrDiff(username, repoName, pr.getSourceBranch(), pr.getTargetBranch());
        if (diff == null) return ResponseEntity.ok(CommitDiffDto.builder().files(List.of()).build());
        return ResponseEntity.ok(diff);
    }

    /** Whether current user can create/approve/merge PRs (owner or collaborator with canCreatePr). */
    @GetMapping("/{username}/{repoName}/can-pr")
    public ResponseEntity<Map<String, Boolean>> canCreatePr(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        boolean can = repoAccessService.canCreateOrApprovePr(currentUser, username, repoName);
        return ResponseEntity.ok(Map.of("canCreatePr", can));
    }

    @PostMapping("/{username}/{repoName}/pull-requests/{prId}/review")
    public ResponseEntity<Void> reviewPr(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName, @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canCreateOrApprovePr(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (!repoService.updatePullRequestReview(username, repoName, prId, currentUser)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{username}/{repoName}/pull-requests/{prId}/approve")
    public ResponseEntity<Void> approvePr(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName, @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canCreateOrApprovePr(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (!repoService.updatePullRequestApprove(username, repoName, prId, currentUser)) {
            return ResponseEntity.notFound().build();
        }
        metricsService.recordPrApproved(currentUser, 0L, true);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{username}/{repoName}/pull-requests/{prId}/merge")
    public ResponseEntity<Map<String, String>> mergePr(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName, @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canCreateOrApprovePr(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        String error = repoService.mergePullRequest(username, repoName, prId);
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("error", error));
        }
        return ResponseEntity.ok(Map.of("status", "merged"));
    }

    @PostMapping("/{username}/{repoName}/pull-requests/{prId}/reject")
    public ResponseEntity<Void> rejectPr(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName, @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canCreateOrApprovePr(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (!repoService.updatePullRequestReject(username, repoName, prId, currentUser)) {
            return ResponseEntity.notFound().build();
        }
        metricsService.recordPrRejected(currentUser);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{username}/{repoName}/commits")
    public ResponseEntity<List<CommitDto>> getCommits(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @RequestParam(defaultValue = "20") int limit) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(repoService.getCommits(username, repoName, Math.min(limit, 100)));
    }

    @GetMapping("/{username}/{repoName}/commits/graph")
    public ResponseEntity<List<CommitDto>> getCommitGraph(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @RequestParam(defaultValue = "50") int limit) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(repoService.getCommitGraph(username, repoName, Math.min(limit, 200)));
    }

    @GetMapping("/{username}/{repoName}/commits/{commitHash}/diff")
    public ResponseEntity<CommitDiffDto> getCommitDiff(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @PathVariable String commitHash) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        CommitDiffDto diff = repoService.getCommitDiff(username, repoName, commitHash);
        if (diff == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(diff);
    }

    @GetMapping("/{username}/{repoName}/files")
    public ResponseEntity<List<FileTreeNodeDto>> getFileTree(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @RequestParam(defaultValue = "master") String branch) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(repoFileService.getFileTree(username, repoName, branch));
    }

    @GetMapping("/{username}/{repoName}/files/content")
    public ResponseEntity<FileContentDto> getFileContent(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @RequestParam String path, @RequestParam(defaultValue = "master") String branch) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        FileContentDto content = repoFileService.getFileContent(username, repoName, branch, path);
        if (content == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(content);
    }

    @GetMapping("/{username}/{repoName}/download")
    public ResponseEntity<byte[]> downloadRepo(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String username, @PathVariable String repoName) {
        String currentUser = repoAccessService.resolveUsername(authHeader);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        byte[] zip = repoDownloadService.downloadAsZip(authHeader, username, repoName);
        String filename = repoName + ".zip";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(zip.length)
                .body(zip);
    }

    /**
     * AI-powered PR risk analysis — proxies to agent-service.
     * POST /api/repos/{username}/{repoName}/pull-requests/{prId}/ai-analysis
     * Returns JSON from agent service: { explanation, riskSummary, success, error }
     */
    @PostMapping("/{username}/{repoName}/pull-requests/{prId}/ai-analysis")
    public ResponseEntity<String> getPrAiAnalysis(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username, @PathVariable String repoName,
            @PathVariable String prId) {
        String currentUser = repoAccessService.resolveUsername(auth);
        if (currentUser == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canAccess(currentUser, username, repoName)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        PrDto pr = repoService.getPullRequest(username, repoName, prId);
        if (pr == null) return ResponseEntity.notFound().build();

        // Fetch diff to get file list and line counts from actual diff data
        CommitDiffDto diff = repoService.getPrDiff(username, repoName, pr.getSourceBranch(), pr.getTargetBranch());
        List<String> filesChanged = pr.getRiskReasons() != null ? new java.util.ArrayList<>() : new java.util.ArrayList<>();
        int linesAdded = pr.getSummaryLinesAdded() != null ? pr.getSummaryLinesAdded() : 0;
        int linesRemoved = pr.getSummaryLinesRemoved() != null ? pr.getSummaryLinesRemoved() : 0;

        // Collect changed files and build diff sample
        StringBuilder diffSample = new StringBuilder();
        if (diff != null && diff.getFiles() != null) {
            for (var f : diff.getFiles()) {
                filesChanged.add(f.getPath());
                if (diffSample.length() < 3000 && f.getUnifiedDiff() != null) {
                    diffSample.append("--- ").append(f.getPath()).append("\n");
                    diffSample.append(f.getUnifiedDiff(), 0,
                            Math.min(f.getUnifiedDiff().length(), 800)).append("\n\n");
                }
            }
        } else if (pr.getSummaryFilesChanged() != null) {
            linesAdded = pr.getSummaryLinesAdded() != null ? pr.getSummaryLinesAdded() : 0;
            linesRemoved = pr.getSummaryLinesRemoved() != null ? pr.getSummaryLinesRemoved() : 0;
        }

        // Build JSON body for agent service
        String reasons = pr.getRiskReasons() == null ? "[]" :
                "[" + pr.getRiskReasons().stream()
                     .map(r -> "\"" + r.replace("\"", "\\\"") + "\"")
                     .collect(Collectors.joining(",")) + "]";
        String files = "[" + filesChanged.stream()
                .map(f -> "\"" + f.replace("\"", "\\\"") + "\"")
                .collect(Collectors.joining(",")) + "]";

        try {
            String agentBody = String.format("""
                {
                  "repositoryName": "%s",
                  "sourceBranch": "%s",
                  "targetBranch": "%s",
                  "author": "%s",
                  "filesChanged": %s,
                  "linesAdded": %d,
                  "linesRemoved": %d,
                  "riskReasons": %s,
                  "riskLevel": "%s",
                  "diffSample": "%s"
                }
                """,
                    escapeJson(username + "/" + repoName),
                    escapeJson(pr.getSourceBranch()),
                    escapeJson(pr.getTargetBranch()),
                    escapeJson(pr.getAuthor()),
                    files,
                    linesAdded, linesRemoved,
                    reasons,
                    pr.getRiskLevel() != null ? pr.getRiskLevel() : "UNKNOWN",
                    escapeJson(diffSample.toString())
            );

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(agentServiceUrl + "/api/agent/pr-analysis"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(agentBody))
                    .timeout(Duration.ofSeconds(35))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            return ResponseEntity.status(resp.statusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(resp.body());

        } catch (IOException | InterruptedException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"success\":false,\"error\":\"Agent service unreachable: " + e.getMessage() + "\"}");
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}
