package com.vega.repos.service;

import com.vega.repos.dto.BranchDto;
import com.vega.repos.dto.CommitDiffDto;
import com.vega.repos.dto.CommitDto;
import com.vega.repos.dto.FileContentDto;
import com.vega.repos.dto.FileTreeNodeDto;
import com.vega.repos.dto.PrDto;
import com.vega.repos.dto.RepoDto;
import com.vega.repos.entity.RepoSettings;
import com.vega.repos.repository.RepoCollaboratorRepository;
import com.vega.repos.repository.RepoSettingsRepository;
import org.apache.hadoop.fs.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

@Service
public class RepoService {

    private static final Logger log = LoggerFactory.getLogger(RepoService.class);

    private final FileSystem fileSystem;
    private final RepoCollaboratorRepository collaboratorRepository;
    private final RepoSettingsRepository repoSettingsRepository;

    @Value("${hdfs.base-path:/vega/repositories}")
    private String basePath;

    @Value("${vega.agent-service.url:http://localhost:8084}")
    private String agentServiceUrl;

    public RepoService(FileSystem fileSystem, RepoCollaboratorRepository collaboratorRepository,
                       RepoSettingsRepository repoSettingsRepository) {
        this.fileSystem = fileSystem;
        this.collaboratorRepository = collaboratorRepository;
        this.repoSettingsRepository = repoSettingsRepository;
    }

    /** List repos visible to user: own repos + repos where user is collaborator. */
    public List<RepoDto> listRepositoriesForUser(String currentUsername) {
        List<RepoDto> result = new ArrayList<>(listRepositories(currentUsername));
        // Case-insensitive so shared repos appear regardless of username casing (login vs form input).
        var collabRepos = collaboratorRepository.findByCollaboratorUsernameIgnoreCase(currentUsername);
        for (var c : collabRepos) {
            var repo = getRepoDetail(c.getOwnerUsername(), c.getRepoName());
            if (repo != null) {
                result.add(repo);
            } else {
                log.debug("Collaborator repo {}/{} not found on HDFS, skipping from list", c.getOwnerUsername(), c.getRepoName());
            }
        }
        return result;
    }

    /** List all usernames that have repositories in HDFS. */
    public List<String> listAllUsernames() {
        List<String> usernames = new ArrayList<>();
        try {
            Path base = new Path(basePath);
            if (!fileSystem.exists(base)) return usernames;
            FileStatus[] statuses = fileSystem.listStatus(base);
            for (FileStatus status : statuses) {
                if (status.isDirectory()) {
                    String name = status.getPath().getName();
                    if (!name.startsWith(".")) {
                        usernames.add(name);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to list usernames from HDFS: {}", e.getMessage());
        }
        return usernames;
    }

    public List<RepoDto> listRepositories(String username) {
        List<RepoDto> repos = new ArrayList<>();
        Path userPath = new Path(basePath + "/" + username);

        try {
            if (!fileSystem.exists(userPath)) {
                return repos;
            }

            FileStatus[] statuses = fileSystem.listStatus(userPath);
            for (FileStatus status : statuses) {
                if (status.isDirectory()) {
                    String name = status.getPath().getName();
                    if (!name.startsWith(".")) {
                        repos.add(RepoDto.builder()
                                .name(name)
                                .path(userPath + "/" + name)
                                .owner(username)
                                .build());
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to list repositories for user {}", username, e);
            throw new RuntimeException("Failed to list repositories: " + e.getMessage());
        }
        enrichWithSettings(repos);
        return repos;
    }

    /** Enrich RepoDto list with visibility + description from DB. */
    private void enrichWithSettings(List<RepoDto> repos) {
        for (RepoDto repo : repos) {
            repoSettingsRepository.findByOwnerUsernameAndRepoName(repo.getOwner(), repo.getName())
                    .ifPresent(s -> {
                        repo.setIsPublic(s.getIsPublic() != null && s.getIsPublic());
                        repo.setDescription(s.getDescription());
                    });
        }
    }

    /** Check if a repo is public. */
    public boolean isRepoPublic(String ownerUsername, String repoName) {
        return repoSettingsRepository.existsByOwnerUsernameAndRepoNameAndIsPublicTrue(ownerUsername, repoName);
    }

    /** Set repo visibility. Creates settings row if not exists. */
    public void setRepoVisibility(String ownerUsername, String repoName, boolean isPublic, String description) {
        RepoSettings settings = repoSettingsRepository.findByOwnerUsernameAndRepoName(ownerUsername, repoName)
                .orElseGet(() -> RepoSettings.builder()
                        .ownerUsername(ownerUsername)
                        .repoName(repoName)
                        .build());
        settings.setIsPublic(isPublic);
        if (description != null) settings.setDescription(description);
        repoSettingsRepository.save(settings);
    }

    /**
     * Search repositories visible to the given user.
     * Returns public repos matching the query + user's own repos + collaborator repos.
     * Uses prefix matching, substring matching, and simple relevance scoring.
     */
    public List<RepoDto> searchRepositories(String query, String currentUser) {
        String q = query != null ? query.trim().toLowerCase() : "";
        List<RepoDto> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        List<String> allUsers = listAllUsernames();
        for (String user : allUsers) {
            try {
                List<RepoDto> repos = listRepositories(user);
                for (RepoDto repo : repos) {
                    String key = repo.getOwner() + "/" + repo.getName();
                    if (seen.contains(key)) continue;

                    boolean isPublic = repo.getIsPublic() != null && repo.getIsPublic();
                    boolean isOwner = currentUser != null && currentUser.equals(repo.getOwner());
                    boolean isCollab = currentUser != null && collaboratorRepository
                            .existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(repo.getOwner(), repo.getName(), currentUser);

                    if (isPublic || isOwner || isCollab) {
                        if (q.isEmpty() || matchesQuery(repo, q)) {
                            seen.add(key);
                            results.add(repo);
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("Error scanning repos for user {}: {}", user, e.getMessage());
            }
        }

        results.sort((a, b) -> {
            int sa = searchScore(a, q, currentUser);
            int sb = searchScore(b, q, currentUser);
            return Integer.compare(sb, sa);
        });

        return results;
    }

    /**
     * Repos owned by {@code ownerUsername} that {@code viewerUsername} may see:
     * public repos, or any repo where the viewer is the owner, or private repos where the viewer is a collaborator.
     */
    public List<RepoDto> listRepositoriesVisibleToViewer(String ownerUsername, String viewerUsername) {
        if (viewerUsername == null || viewerUsername.isBlank()) {
            return List.of();
        }
        List<RepoDto> owned = listRepositories(ownerUsername);
        List<RepoDto> out = new ArrayList<>();
        for (RepoDto repo : owned) {
            boolean isPublic = repo.getIsPublic() != null && repo.getIsPublic();
            boolean isOwner = viewerUsername.equals(ownerUsername);
            boolean isCollab = collaboratorRepository.existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
                    ownerUsername, repo.getName(), viewerUsername);
            if (isPublic || isOwner || isCollab) {
                out.add(repo);
            }
        }
        return out;
    }

    private boolean matchesQuery(RepoDto repo, String q) {
        String name = repo.getName().toLowerCase();
        String owner = repo.getOwner().toLowerCase();
        String full = owner + "/" + name;
        String desc = repo.getDescription() != null ? repo.getDescription().toLowerCase() : "";
        return name.contains(q) || owner.contains(q) || full.contains(q) || desc.contains(q);
    }

    private int searchScore(RepoDto repo, String q, String currentUser) {
        if (q.isEmpty()) return 0;
        int score = 0;
        String name = repo.getName().toLowerCase();
        String owner = repo.getOwner().toLowerCase();
        if (name.equals(q)) score += 100;
        else if (name.startsWith(q)) score += 80;
        else if (name.contains(q)) score += 50;
        if (owner.equals(q)) score += 30;
        if (currentUser != null && currentUser.equals(repo.getOwner())) score += 20;
        if (repo.getIsPublic() != null && repo.getIsPublic()) score += 10;
        return score;
    }

    public RepoDto getRepoDetail(String username, String repoName) {
        Path repoPath = new Path(basePath + "/" + username + "/" + repoName);
        try {
            if (!fileSystem.exists(repoPath)) {
                return null;
            }
            RepoDto dto = RepoDto.builder()
                    .name(repoName)
                    .path(repoPath.toString())
                    .owner(username)
                    .build();
            repoSettingsRepository.findByOwnerUsernameAndRepoName(username, repoName)
                    .ifPresent(s -> {
                        dto.setIsPublic(s.getIsPublic() != null && s.getIsPublic());
                        dto.setDescription(s.getDescription());
                    });
            return dto;
        } catch (Exception e) {
            log.error("Failed to get repo detail for {}/{}", username, repoName, e);
            throw new RuntimeException("Failed to get repo detail: " + e.getMessage());
        }
    }

    public List<BranchDto> getBranches(String username, String repoName) {
        List<BranchDto> branches = new ArrayList<>();
        Path refsHeadsPath = new Path(basePath + "/" + username + "/" + repoName + "/refs/heads");
        String repoPathStr = basePath + "/" + username + "/" + repoName;

        try {
            if (!fileSystem.exists(refsHeadsPath)) {
                return branches;
            }
            collectBranchRefs(refsHeadsPath, refsHeadsPath, branches, repoPathStr);
            for (BranchDto b : branches) {
                String h = b.getCommitHash();
                if (h == null || h.isBlank()) {
                    continue;
                }
                h = h.trim().toLowerCase(Locale.ROOT);
                b.setCommitHash(h);
                if (h.length() < 38) {
                    String resolved = resolveToFullHash(username, repoName, h);
                    if (resolved != null) {
                        h = resolved.toLowerCase(Locale.ROOT);
                        b.setCommitHash(h);
                    }
                }
                CommitDto tip = parseCommitObject(username, repoName, h, repoPathStr);
                if (tip != null) {
                    b.setTipMessage(tip.getMessage());
                    b.setTipAuthor(tip.getAuthor());
                    b.setTipTimestamp(tip.getTimestamp());
                    b.setTipShortHash(tip.getHash());
                }
            }
            branches.sort((a, b) -> {
                Long ta = a.getTipTimestamp();
                Long tb = b.getTipTimestamp();
                if (ta == null && tb == null) {
                    return String.valueOf(a.getName()).compareToIgnoreCase(String.valueOf(b.getName()));
                }
                if (ta == null) {
                    return 1;
                }
                if (tb == null) {
                    return -1;
                }
                int c = Long.compare(tb, ta);
                if (c != 0) {
                    return c;
                }
                return String.valueOf(a.getName()).compareToIgnoreCase(String.valueOf(b.getName()));
            });
        } catch (Exception e) {
            log.error("Failed to list branches for {}/{}", username, repoName, e);
            throw new RuntimeException("Failed to list branches: " + e.getMessage());
        }
        return branches;
    }

    private void collectBranchRefs(Path refsRoot, Path current, List<BranchDto> branches, String repoRoot) throws Exception {
        FileStatus[] statuses = fileSystem.listStatus(current);
        String rootUri = refsRoot.toUri().getPath();
        for (FileStatus status : statuses) {
            if (status.isFile()) {
                String fileUri = status.getPath().toUri().getPath();
                String branchName = fileUri.substring(rootUri.length() + 1);
                String rawRef = readFileContent(status.getPath());
                String commitHash = resolveRefToCommitHash(repoRoot, rawRef, 0);
                branches.add(BranchDto.builder().name(branchName).commitHash(commitHash).build());
            } else if (status.isDirectory()) {
                collectBranchRefs(refsRoot, status.getPath(), branches, repoRoot);
            }
        }
    }

    /**
     * Follows symbolic refs (ref: …) to a hex commit id. Tries both {@code repo/refs/…} and {@code repo/.vega/refs/…}.
     */
    private String resolveRefToCommitHash(String repoRoot, String raw, int depth) {
        if (raw == null || depth > 16) {
            return null;
        }
        String t = raw.trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.startsWith("ref: ")) {
            String ref = t.substring(5).trim();
            Path[] candidates = {
                    new Path(repoRoot + "/" + ref),
                    new Path(repoRoot + "/.vega/" + ref),
            };
            for (Path p : candidates) {
                try {
                    if (fileSystem.exists(p)) {
                        String next = readFileContent(p);
                        return resolveRefToCommitHash(repoRoot, next, depth + 1);
                    }
                } catch (Exception ignored) {
                    // try next
                }
            }
            return null;
        }
        String hex = t.split("\\s+")[0].trim().toLowerCase(Locale.ROOT);
        if (hex.matches("[a-f0-9]{4,40}")) {
            return hex;
        }
        return null;
    }

    /** Vega objects may live at {@code ab/cd…}, {@code .vega/objects/ab/cd…}, or legacy {@code objects/ab/cd…}. */
    private Path findCommitObjectPath(String repoPathStr, String hash) {
        if (hash == null || hash.length() < 4) {
            return null;
        }
        String h = hash.trim().toLowerCase(Locale.ROOT);
        String shortH = h.substring(0, 2);
        String rest = h.substring(2);
        Path[] candidates = {
                new Path(repoPathStr + "/" + shortH + "/" + rest),
                new Path(repoPathStr + "/.vega/objects/" + shortH + "/" + rest),
                new Path(repoPathStr + "/objects/" + shortH + "/" + rest),
        };
        for (Path p : candidates) {
            try {
                if (fileSystem.exists(p)) {
                    return p;
                }
            } catch (Exception ignored) {
                // continue
            }
        }
        return null;
    }

    public List<CommitDto> getCommits(String username, String repoName, int limit) {
        List<CommitDto> commits = new ArrayList<>();
        Path repoPath = new Path(basePath + "/" + username + "/" + repoName);

        try {
            if (!fileSystem.exists(repoPath)) {
                return commits;
            }

            List<String> commitHashes = collectCommitObjects(repoPath, limit);
            for (String hash : commitHashes) {
                CommitDto commit = parseCommitObject(username, repoName, hash, repoPath.toString());
                if (commit != null) {
                    commits.add(commit);
                }
            }
            commits.sort((a, b) -> Long.compare(b.getTimestamp(), a.getTimestamp()));
        } catch (Exception e) {
            log.error("Failed to list commits for {}/{}", username, repoName, e);
            throw new RuntimeException("Failed to list commits: " + e.getMessage());
        }
        return commits;
    }

    /**
     * Walks all branches and returns a commit graph with branch annotations.
     * Each commit includes its parent hash and which branch(es) point to it as tip.
     */
    public List<CommitDto> getCommitGraph(String username, String repoName, int limit) {
        Path repoPath = new Path(basePath + "/" + username + "/" + repoName);
        try {
            if (!fileSystem.exists(repoPath)) return Collections.emptyList();

            List<BranchDto> allBranches = getBranches(username, repoName);
            Map<String, List<String>> tipBranches = new HashMap<>();
            Set<String> visited = new LinkedHashSet<>();

            for (BranchDto branch : allBranches) {
                String tipHash = branch.getCommitHash();
                if (tipHash == null) continue;
                tipBranches.computeIfAbsent(tipHash, k -> new ArrayList<>()).add(branch.getName());
                walkCommitChain(username, repoName, tipHash, visited, limit);
            }

            List<CommitDto> graph = new ArrayList<>();
            String repoPathStr = repoPath.toString();
            for (String hash : visited) {
                CommitDto c = parseCommitObject(username, repoName, hash, repoPathStr);
                if (c != null) {
                    c.setBranches(tipBranches.getOrDefault(hash, null));
                    graph.add(c);
                }
                if (graph.size() >= limit) break;
            }
            graph.sort((a, b) -> Long.compare(b.getTimestamp(), a.getTimestamp()));
            return graph;
        } catch (Exception e) {
            log.error("Failed to build commit graph for {}/{}: {}", username, repoName, e.getMessage());
            return Collections.emptyList();
        }
    }

    private void walkCommitChain(String username, String repoName, String commitHash, Set<String> visited, int limit) {
        if (commitHash == null || visited.contains(commitHash) || visited.size() >= limit) return;
        visited.add(commitHash);
        String content = readCommitObject(username, repoName, commitHash);
        if (content == null) return;
        String p1 = null, p2 = null;
        for (String line : content.replace("\r", "").split("\n")) {
            if (line.startsWith("parent ")) {
                if (p1 == null) p1 = line.substring(7).trim();
                else { p2 = line.substring(7).trim(); break; }
            }
        }
        walkCommitChain(username, repoName, p1, visited, limit);
        walkCommitChain(username, repoName, p2, visited, limit);
    }

    public List<FileTreeNodeDto> getFileTree(String username, String repoName, String branch) {
        try {
            String commitHash = getCommitHashForBranch(username, repoName, branch);
            if (commitHash == null) return Collections.emptyList();
            String treeHash = getTreeHashFromCommit(username, repoName, commitHash);
            if (treeHash == null) return Collections.emptyList();
            return walkTree(username, repoName, treeHash, "");
        } catch (Exception e) {
            log.error("Failed to get file tree for {}/{}", username, repoName, e);
            return Collections.emptyList();
        }
    }

    public FileContentDto getFileContent(String username, String repoName, String branch, String filePath) {
        try {
            String commitHash = getCommitHashForBranch(username, repoName, branch);
            if (commitHash == null) return null;
            String treeHash = getTreeHashFromCommit(username, repoName, commitHash);
            if (treeHash == null) return null;
            String blobHash = findBlobInTree(username, repoName, treeHash, filePath);
            if (blobHash == null) return null;
            byte[] content = readBlobContent(username, repoName, blobHash);
            if (content == null) return null;
            boolean binary = !RepoFileService.isTextFile(filePath);
            String contentStr = binary ? "(binary file)" : new String(content, StandardCharsets.UTF_8);
            return FileContentDto.builder().path(filePath).content(contentStr).binary(binary).build();
        } catch (Exception e) {
            log.error("Failed to get file content {} in {}/{}", filePath, username, repoName, e);
            return null;
        }
    }

    private String getCommitHashForBranch(String username, String repoName, String branch) {
        Path refPath = new Path(basePath + "/" + username + "/" + repoName + "/refs/heads/" + branch);
        try {
            if (!fileSystem.exists(refPath)) return null;
            String hash = readFileContent(refPath);
            return hash != null ? hash.trim() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String getTreeHashFromCommit(String username, String repoName, String commitHash) {
        String content = readCommitObject(username, repoName, commitHash);
        if (content == null) return null;
        for (String line : content.split("\\r?\\n")) {
            if (line.startsWith("tree ")) return line.substring(5).trim();
        }
        return null;
    }

    private String getParentHashFromCommit(String username, String repoName, String commitHash) {
        String content = readCommitObject(username, repoName, commitHash);
        if (content == null) return null;
        for (String line : content.split("\\r?\\n")) {
            if (line.startsWith("parent ")) return line.substring(7).trim();
        }
        return null;
    }

    private List<String> getParentHashesFromCommit(String username, String repoName, String commitHash) {
        String content = readCommitObject(username, repoName, commitHash);
        if (content == null) return List.of();
        List<String> parents = new ArrayList<>();
        for (String line : content.split("\\r?\\n")) {
            if (line.startsWith("parent ")) parents.add(line.substring(7).trim());
        }
        return parents;
    }

    /** Get commit diff (changed files). commitHash can be short (12 chars) or full. */
    public CommitDiffDto getCommitDiff(String username, String repoName, String commitHash) {
        String fullHash = resolveToFullHash(username, repoName, commitHash);
        if (fullHash == null) fullHash = commitHash;
        CommitDto commit = parseCommitObject(username, repoName, fullHash, basePath + "/" + username + "/" + repoName);
        if (commit == null) return null;
        String treeHash = getTreeHashFromCommit(username, repoName, fullHash);
        if (treeHash == null) return null;
        String parentHash = getParentHashFromCommit(username, repoName, fullHash);
        Map<String, String> parentBlobs = new HashMap<>();
        if (parentHash != null) {
            String parentTree = getTreeHashFromCommit(username, repoName, parentHash);
            if (parentTree != null) collectBlobsFromTree(username, repoName, parentTree, "", parentBlobs);
        }
        Map<String, String> currentBlobs = new HashMap<>();
        collectBlobsFromTree(username, repoName, treeHash, "", currentBlobs);
        List<CommitDiffDto.FileDiffDto> files = new ArrayList<>();
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(parentBlobs.keySet());
        allPaths.addAll(currentBlobs.keySet());
        for (String path : allPaths) {
            String parentBlob = parentBlobs.get(path);
            String currentBlob = currentBlobs.get(path);
            if (parentBlob == null && currentBlob != null) {
                String diff = buildUnifiedDiff(username, repoName, null, currentBlob, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("added").unifiedDiff(diff).build());
            } else if (parentBlob != null && currentBlob == null) {
                String diff = buildUnifiedDiff(username, repoName, parentBlob, null, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("deleted").unifiedDiff(diff).build());
            } else if (parentBlob != null && currentBlob != null && !parentBlob.equals(currentBlob)) {
                String diff = buildUnifiedDiff(username, repoName, parentBlob, currentBlob, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("modified").unifiedDiff(diff).build());
            }
        }
        files.sort(Comparator.comparing(CommitDiffDto.FileDiffDto::getPath));
        return CommitDiffDto.builder()
                .commitHash(commit.getHash())
                .message(commit.getMessage())
                .author(commit.getAuthor())
                .timestamp(commit.getTimestamp())
                .files(files)
                .build();
    }

    private void collectBlobsFromTree(String username, String repoName, String treeHash, String prefix, Map<String, String> out) {
        String content = readTreeObject(username, repoName, treeHash);
        if (content == null) return;
        for (String line : content.split("\\r?\\n")) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split(" ", 3);
            if (parts.length != 3) continue;
            String type = parts[0];
            String hash = parts[1];
            String name = parts[2];
            String path = prefix.isEmpty() ? name : prefix + "/" + name;
            if ("blob".equalsIgnoreCase(type)) {
                out.put(path, hash);
            } else if ("tree".equalsIgnoreCase(type)) {
                collectBlobsFromTree(username, repoName, hash, path, out);
            }
        }
    }

    private String buildUnifiedDiff(String username, String repoName, String oldBlobHash, String newBlobHash, String path) {
        byte[] oldBytes = readBlobContent(username, repoName, oldBlobHash);
        byte[] newBytes = readBlobContent(username, repoName, newBlobHash);
        if (oldBytes == null) oldBytes = new byte[0];
        if (newBytes == null) newBytes = new byte[0];
        if (!RepoFileService.isTextFile(path)) {
            return "(binary file changed)";
        }
        String oldStr = new String(oldBytes, StandardCharsets.UTF_8);
        String newStr = new String(newBytes, StandardCharsets.UTF_8);
        String[] oldLines = oldStr.split("\n", -1);
        String[] newLines = newStr.split("\n", -1);
        return computeUnifiedDiff(oldLines, newLines, path, 3);
    }

    /**
     * Computes a proper unified diff using LCS (Longest Common Subsequence).
     * Unchanged lines appear as context lines (space prefix), not as deletions/insertions.
     */
    private String computeUnifiedDiff(String[] a, String[] b, String path, int ctx) {
        int m = a.length;
        int n = b.length;

        // For very large files fall back to a simple header-only diff to avoid OOM
        if ((long) m * n > 3_000_000L) {
            StringBuilder fb = new StringBuilder();
            fb.append("--- a/").append(path).append("\n");
            fb.append("+++ b/").append(path).append("\n");
            fb.append("@@ -1,").append(m).append(" +1,").append(n).append(" @@\n");
            for (String line : a) fb.append("-").append(line).append("\n");
            for (String line : b) fb.append("+").append(line).append("\n");
            return fb.length() > 50000 ? fb.substring(0, 50000) + "\n... (truncated)" : fb.toString();
        }

        // LCS dynamic programming table (bottom-up)
        int[][] dp = new int[m + 1][n + 1];
        for (int i = m - 1; i >= 0; i--) {
            for (int j = n - 1; j >= 0; j--) {
                if (a[i].equals(b[j])) {
                    dp[i][j] = dp[i + 1][j + 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
                }
            }
        }

        // Reconstruct edit operations: 'C'=context, 'D'=delete, 'I'=insert
        List<Character> ops = new ArrayList<>(m + n);
        List<Integer> aIdx = new ArrayList<>(m + n);
        List<Integer> bIdx = new ArrayList<>(m + n);
        int i = 0, j = 0;
        while (i < m && j < n) {
            if (a[i].equals(b[j])) {
                ops.add('C'); aIdx.add(i); bIdx.add(j); i++; j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                ops.add('D'); aIdx.add(i); bIdx.add(-1); i++;
            } else {
                ops.add('I'); aIdx.add(-1); bIdx.add(j); j++;
            }
        }
        while (i < m) { ops.add('D'); aIdx.add(i++); bIdx.add(-1); }
        while (j < n) { ops.add('I'); aIdx.add(-1); bIdx.add(j++); }

        int total = ops.size();

        // Mark which op indices are "in a hunk" (within ctx of a change)
        boolean[] inHunk = new boolean[total];
        for (int k = 0; k < total; k++) {
            if (ops.get(k) != 'C') {
                int lo = Math.max(0, k - ctx);
                int hi = Math.min(total, k + ctx + 1);
                for (int d = lo; d < hi; d++) inHunk[d] = true;
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("--- a/").append(path).append("\n");
        sb.append("+++ b/").append(path).append("\n");

        int k = 0;
        while (k < total) {
            if (!inHunk[k]) { k++; continue; }

            // Determine hunk boundaries
            int hStart = k;
            while (k < total && inHunk[k]) k++;
            int hEnd = k;

            // Compute @@ header numbers
            int oldStart = 1, newStart = 1;
            for (int h = 0; h < hStart; h++) {
                char op = ops.get(h);
                if (op == 'C' || op == 'D') oldStart++;
                if (op == 'C' || op == 'I') newStart++;
            }
            int oldCount = 0, newCount = 0;
            for (int h = hStart; h < hEnd; h++) {
                char op = ops.get(h);
                if (op == 'C' || op == 'D') oldCount++;
                if (op == 'C' || op == 'I') newCount++;
            }

            sb.append("@@ -").append(oldStart).append(",").append(oldCount)
              .append(" +").append(newStart).append(",").append(newCount).append(" @@\n");

            for (int h = hStart; h < hEnd; h++) {
                char op = ops.get(h);
                if (op == 'C') {
                    sb.append(" ").append(a[aIdx.get(h)]).append("\n");
                } else if (op == 'D') {
                    sb.append("-").append(a[aIdx.get(h)]).append("\n");
                } else {
                    sb.append("+").append(b[bIdx.get(h)]).append("\n");
                }
            }

            if (sb.length() > 50000) {
                sb.append("\n... (truncated)");
                break;
            }
        }

        return sb.toString();
    }

    private String readCommitObject(String username, String repoName, String hash) {
        Path objPath = objectPath(username, repoName, hash);
        if (objPath == null) return null;
        String raw = readFileContent(objPath);
        if (raw == null) return null;
        int nul = raw.indexOf('\0');
        if (nul >= 0) raw = raw.substring(nul + 1);
        return raw.trim().startsWith("tree ") ? raw : null;
    }

    private List<FileTreeNodeDto> walkTree(String username, String repoName, String treeHash, String prefix) {
        String content = readTreeObject(username, repoName, treeHash);
        if (content == null) return Collections.emptyList();
        List<FileTreeNodeDto> result = new ArrayList<>();
        for (String line : content.split("\\r?\\n")) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split(" ", 3);
            if (parts.length != 3) continue;
            String type = parts[0];
            String hash = parts[1];
            String name = parts[2];
            String path = prefix.isEmpty() ? name : prefix + "/" + name;
            if ("blob".equalsIgnoreCase(type)) {
                result.add(FileTreeNodeDto.builder().name(name).path(path).type("file").children(null).build());
            } else if ("tree".equalsIgnoreCase(type)) {
                List<FileTreeNodeDto> children = walkTree(username, repoName, hash, path);
                result.add(FileTreeNodeDto.builder().name(name).path(path).type("folder").children(children).build());
            }
        }
        result.sort((a, b) -> {
            boolean aFolder = "folder".equals(a.getType());
            boolean bFolder = "folder".equals(b.getType());
            if (aFolder != bFolder) return aFolder ? -1 : 1;
            return a.getName().compareToIgnoreCase(b.getName());
        });
        return result;
    }

    private String readTreeObject(String username, String repoName, String hash) {
        Path objPath = objectPath(username, repoName, hash);
        if (objPath == null) return null;
        String raw = readFileContent(objPath);
        if (raw == null) return null;
        int nul = raw.indexOf('\0');
        if (nul >= 0) raw = raw.substring(nul + 1);
        return raw;
    }

    private String findBlobInTree(String username, String repoName, String treeHash, String targetPath) {
        String content = readTreeObject(username, repoName, treeHash);
        if (content == null) return null;
        int slash = targetPath.indexOf('/');
        String first = slash < 0 ? targetPath : targetPath.substring(0, slash);
        String rest = slash < 0 ? null : targetPath.substring(slash + 1);
        for (String line : content.split("\n")) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split(" ", 3);
            if (parts.length != 3) continue;
            String type = parts[0];
            String hash = parts[1];
            String name = parts[2];
            if (!name.equals(first)) continue;
            if ("blob".equalsIgnoreCase(type)) return rest == null ? hash : null;
            if ("tree".equalsIgnoreCase(type) && rest != null) return findBlobInTree(username, repoName, hash, rest);
            break;
        }
        return null;
    }

    private byte[] readBlobContent(String username, String repoName, String blobHash) {
        Path objPath = objectPath(username, repoName, blobHash);
        if (objPath == null) return null;
        byte[] raw = readFileBytes(objPath);
        if (raw == null) return null;
        raw = maybeDecompress(raw);
        if (raw == null) return null;
        int nul = -1;
        for (int i = 0; i < raw.length; i++) {
            if (raw[i] == 0) { nul = i; break; }
        }
        if (nul >= 0) {
            return Arrays.copyOfRange(raw, nul + 1, raw.length);
        }
        return raw;
    }

    private Path objectPath(String username, String repoName, String hash) {
        if (hash == null || hash.length() < 4) return null;
        String shortHash = hash.substring(0, 2);
        String rest = hash.substring(2);
        return new Path(basePath + "/" + username + "/" + repoName + "/" + shortHash + "/" + rest);
    }

    /** Resolve short hash (e.g. 12 chars) to full hash by scanning object shard. */
    private String resolveToFullHash(String username, String repoName, String shortHash) {
        if (shortHash == null || shortHash.length() < 4) return null;
        shortHash = shortHash.trim().toLowerCase(Locale.ROOT);
        if (shortHash.length() >= 38) return shortHash; // likely already full
        try {
            Path shardDir = new Path(basePath + "/" + username + "/" + repoName + "/" + shortHash.substring(0, 2));
            if (!fileSystem.exists(shardDir)) return null;
            String prefix = shortHash.substring(2);
            FileStatus[] files = fileSystem.listStatus(shardDir);
            for (FileStatus f : files) {
                if (f.isFile() && f.getPath().getName().startsWith(prefix)) {
                    return shortHash.substring(0, 2) + f.getPath().getName();
                }
            }
        } catch (Exception e) {
            log.debug("Could not resolve short hash {}: {}", shortHash, e.getMessage());
        }
        return null;
    }

    private List<String> collectCommitObjects(Path repoPath, int limit) throws Exception {
        List<String> hashes = new ArrayList<>();
        collectCommitObjectsRecursive(repoPath, repoPath, hashes, limit);
        // Sort by traversing from HEAD refs to get chronological order; for now keep discovery order
        return hashes;
    }

    private void collectCommitObjectsRecursive(Path repoBase, Path currentPath,
                                               List<String> hashes, int limit) throws Exception {
        if (hashes.size() >= limit) return;
        // Skip refs, HEAD, metadata
        String currentName = currentPath.getName();
        if ("refs".equals(currentName) || "heads".equals(currentName) || ".vega-metadata".equals(currentName))
            return;

        FileStatus[] statuses = fileSystem.listStatus(currentPath);
        for (FileStatus status : statuses) {
            if (status.isDirectory()) {
                collectCommitObjectsRecursive(repoBase, status.getPath(), hashes, limit);
            } else {
                String fileName = status.getPath().getName();
                if ("HEAD".equals(fileName) || ".vega-metadata".equals(fileName)) continue;
                String content = readFileContent(status.getPath());
                // Commit objects have "commit N\0" header or start with "commit "
                if (content != null && (content.startsWith("commit ") || content.contains("\0tree "))) {
                    Path filePath = status.getPath();
                    Path parent = filePath.getParent();
                    String hash = null;
                    if (parent != null) {
                        String dirName = parent.getName();
                        hash = dirName + fileName;
                    }
                    if (hash != null && hash.length() >= 6 && hash.matches("[a-f0-9]+")) {
                        hashes.add(hash);
                        if (hashes.size() >= limit) return;
                    }
                }
            }
        }
    }

    private CommitDto parseCommitObject(String username, String repoName, String hash, String repoPathStr) {
        try {
            if (hash == null || hash.isBlank()) {
                return null;
            }
            hash = hash.trim().toLowerCase(Locale.ROOT);
            Path objectPath = findCommitObjectPath(repoPathStr, hash);
            if (objectPath == null) {
                return null;
            }

            String content = readFileContent(objectPath);
            if (content == null || !content.contains("commit ")) {
                return null;
            }
            // VEGA format: "commit N\0tree ..." - skip header to get content
            int nul = content.indexOf('\0');
            if (nul >= 0) {
                content = content.substring(nul + 1);
            }
            if (!content.trim().startsWith("tree ")) {
                return null;
            }

            return parseCommitContent(content, hash, repoPathStr);
        } catch (Exception e) {
            log.warn("Failed to parse commit {}: {}", hash, e.getMessage());
            return null;
        }
    }

    private CommitDto parseCommitContent(String content, String fullHash, String repoPathStr) {
        String message = "";
        String author = "";
        long timestamp = 0L;
        String parentHash = null;
        String secondParentHash = null;

        content = content.replace("\r", "");

        // Author line: VEGA CommitObj — last whitespace-separated token is epoch seconds (see CommitObj.getStorageBytes)
        for (String line : content.split("\n")) {
            if (line.startsWith("parent ")) {
                if (parentHash == null) {
                    parentHash = line.substring(7).trim();
                } else {
                    secondParentHash = line.substring(7).trim();
                }
            } else if (line.startsWith("author ")) {
                String authorLine = line.substring(7).trim().replaceAll("\\s+", " ");
                if (!authorLine.isEmpty()) {
                    String[] parts = authorLine.split(" ");
                    if (parts.length >= 2) {
                        try {
                            long sec = Long.parseLong(parts[parts.length - 1]);
                            timestamp = sec * 1000L;
                            authorLine = String.join(" ", Arrays.copyOfRange(parts, 0, parts.length - 1)).trim();
                        } catch (NumberFormatException ignored) {
                            // keep authorLine as full string
                        }
                    }
                    int emailStart = authorLine.indexOf(" <");
                    author = emailStart > 0 ? authorLine.substring(0, emailStart).trim() : authorLine;
                }
            }
        }

        int msgStart = content.indexOf("\n\n");
        boolean aiGenerated = false;
        if (msgStart >= 0) {
            message = content.substring(msgStart + 2).trim().split("\n")[0];
            aiGenerated = hasAiMetadata(repoPathStr, fullHash);
            if (!aiGenerated && message != null && message.endsWith(" [VEGA]")) {
                aiGenerated = true;
                message = message.substring(0, message.length() - 7).trim();
            }
        }

        return CommitDto.builder()
                .hash(fullHash.length() > 12 ? fullHash.substring(0, 12) : fullHash)
                .fullHash(fullHash)
                .message(message)
                .author(author)
                .timestamp(timestamp)
                .aiGenerated(aiGenerated)
                .parentHash(parentHash)
                .secondParentHash(secondParentHash)
                .build();
    }

    private boolean hasAiMetadata(String repoPathStr, String fullHash) {
        try {
            org.apache.hadoop.fs.Path aiMetaPath = new org.apache.hadoop.fs.Path(repoPathStr + "/ai-meta/" + fullHash + ".json");
            if (!fileSystem.exists(aiMetaPath)) return false;
            String json = readFileContent(aiMetaPath);
            if (json == null) return false;
            JsonNode node = new ObjectMapper().readTree(json);
            return node.has("aiGenerated") && node.get("aiGenerated").asBoolean();
        } catch (Exception e) {
            return false;
        }
    }

    private String readFileContent(Path path) {
        try {
            byte[] raw = readFileBytes(path);
            if (raw == null) return null;
            byte[] data = maybeDecompress(raw);
            return new String(data, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.debug("Could not read file {}: {}", path, e.getMessage());
            return null;
        }
    }

    private byte[] readFileBytes(Path path) {
        try {
            try (FSDataInputStream in = fileSystem.open(path);
                 ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    baos.write(buffer, 0, n);
                }
                return baos.toByteArray();
            }
        } catch (Exception e) {
            log.debug("Could not read file {}: {}", path, e.getMessage());
            return null;
        }
    }

    /** Get single PR by id (e.g. PR-001). */
    public PrDto getPullRequest(String username, String repoName, String prId) {
        List<PrDto> prs = getPullRequests(username, repoName);
        String norm = prId.toUpperCase().startsWith("PR-") ? prId : "PR-" + prId;
        for (PrDto pr : prs) {
            if (pr.getId().equalsIgnoreCase(norm) || pr.getId().equalsIgnoreCase(prId)) return pr;
        }
        return null;
    }

    /**
     * Recompute 3-way merge conflicts from current branch tips (source vs target vs common ancestor).
     * PR JSON stores conflicts only at creation time; target can move forward and conflicts must be live.
     */
    private List<String> computeThreeWayConflictedFiles(String username, String repoName,
                                                          String sourceBranch, String targetBranch) {
        String sourceCommit = getCommitHashForBranch(username, repoName, sourceBranch);
        String targetCommit = getCommitHashForBranch(username, repoName, targetBranch);
        if (sourceCommit == null || targetCommit == null) {
            return Collections.emptyList();
        }
        if (sourceCommit.equals(targetCommit)) {
            return Collections.emptyList();
        }
        String sourceTree = getTreeHashFromCommit(username, repoName, sourceCommit);
        String targetTree = getTreeHashFromCommit(username, repoName, targetCommit);
        Map<String, String> sourceBlobs = new HashMap<>();
        Map<String, String> targetBlobs = new HashMap<>();
        if (sourceTree != null) {
            collectBlobsFromTree(username, repoName, sourceTree, "", sourceBlobs);
        }
        if (targetTree != null) {
            collectBlobsFromTree(username, repoName, targetTree, "", targetBlobs);
        }
        String ancestorCommit = findCommonAncestor(username, repoName, sourceCommit, targetCommit);
        Map<String, String> ancestorBlobs = new HashMap<>();
        if (ancestorCommit != null) {
            String ancestorTree = getTreeHashFromCommit(username, repoName, ancestorCommit);
            if (ancestorTree != null) {
                collectBlobsFromTree(username, repoName, ancestorTree, "", ancestorBlobs);
            }
        }
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(sourceBlobs.keySet());
        allPaths.addAll(targetBlobs.keySet());
        List<String> conflictedFiles = new ArrayList<>();
        for (String path : allPaths) {
            String s = sourceBlobs.get(path);
            String t = targetBlobs.get(path);
            String a = ancestorBlobs.get(path);
            boolean sourceChanged = !Objects.equals(s, a);
            boolean targetChanged = !Objects.equals(t, a);
            if (sourceChanged && targetChanged && !Objects.equals(s, t)) {
                conflictedFiles.add(path);
            }
        }
        return conflictedFiles;
    }

    /** Updates {@code hasConflicts} / {@code conflictedFiles} from current repo state (not terminal PRs). */
    private void refreshPrMergeConflictState(String username, String repoName, PrDto pr) {
        if (pr == null || pr.getSourceBranch() == null || pr.getTargetBranch() == null) {
            return;
        }
        String st = pr.getStatus();
        if (st != null && ("MERGED".equalsIgnoreCase(st) || "REJECTED".equalsIgnoreCase(st))) {
            return;
        }
        try {
            List<String> fresh = computeThreeWayConflictedFiles(username, repoName,
                    pr.getSourceBranch(), pr.getTargetBranch());
            pr.setHasConflicts(fresh != null && !fresh.isEmpty());
            pr.setConflictedFiles(fresh == null || fresh.isEmpty() ? null : fresh);
        } catch (Exception e) {
            log.debug("refreshPrMergeConflictState {}: {}", pr.getId(), e.getMessage());
        }
    }

    /** Get diff between source and target branch (for PR: target=base, source=head). */
    public CommitDiffDto getPrDiff(String username, String repoName, String sourceBranch, String targetBranch) {
        String sourceCommit = getCommitHashForBranch(username, repoName, sourceBranch);
        String targetCommit = getCommitHashForBranch(username, repoName, targetBranch);
        if (sourceCommit == null || targetCommit == null) return null;
        String sourceTree = getTreeHashFromCommit(username, repoName, sourceCommit);
        String targetTree = getTreeHashFromCommit(username, repoName, targetCommit);
        if (sourceTree == null || targetTree == null) return null;
        Map<String, String> targetBlobs = new HashMap<>();
        collectBlobsFromTree(username, repoName, targetTree, "", targetBlobs);
        Map<String, String> sourceBlobs = new HashMap<>();
        collectBlobsFromTree(username, repoName, sourceTree, "", sourceBlobs);
        List<CommitDiffDto.FileDiffDto> files = new ArrayList<>();
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(targetBlobs.keySet());
        allPaths.addAll(sourceBlobs.keySet());
        for (String path : allPaths) {
            String targetBlob = targetBlobs.get(path);
            String sourceBlob = sourceBlobs.get(path);
            if (targetBlob == null && sourceBlob != null) {
                String diff = buildUnifiedDiff(username, repoName, null, sourceBlob, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("added").unifiedDiff(diff).build());
            } else if (targetBlob != null && sourceBlob == null) {
                String diff = buildUnifiedDiff(username, repoName, targetBlob, null, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("deleted").unifiedDiff(diff).build());
            } else if (targetBlob != null && sourceBlob != null && !targetBlob.equals(sourceBlob)) {
                String diff = buildUnifiedDiff(username, repoName, targetBlob, sourceBlob, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("modified").unifiedDiff(diff).build());
            }
        }
        files.sort(Comparator.comparing(CommitDiffDto.FileDiffDto::getPath));
        return CommitDiffDto.builder()
                .commitHash(null)
                .message(sourceBranch + " → " + targetBranch)
                .author(null)
                .timestamp(null)
                .files(files)
                .build();
    }

    /**
     * Stable PR diff snapshot.
     * Uses the PR commit list when available so the Changes tab does not drift after branch heads move.
     */
    public CommitDiffDto getPrDiffSnapshot(String username, String repoName, PrDto pr) {
        if (pr == null) return null;
        List<String> commits = pr.getCommitHashes();
        if (commits != null && !commits.isEmpty()) {
            CommitDiffDto fromCommits = buildDiffFromCommitList(username, repoName, commits,
                    pr.getSourceBranch() + " → " + pr.getTargetBranch());
            if (fromCommits != null && fromCommits.getFiles() != null && !fromCommits.getFiles().isEmpty()) {
                return fromCommits;
            }

            String sourceTip = commits.get(commits.size() - 1);
            String firstCommit = commits.get(0);
            String baseCommit = getParentHashFromCommit(username, repoName, firstCommit);
            if (baseCommit == null || baseCommit.isBlank()) {
                baseCommit = getCommitHashForBranch(username, repoName, pr.getTargetBranch());
            }
            CommitDiffDto diff = buildDiffBetweenCommits(
                    username, repoName, baseCommit, sourceTip,
                    pr.getSourceBranch() + " → " + pr.getTargetBranch()
            );
            if (diff != null) return diff;
        }
        // Fallback to live branch diff for older PRs without commit list.
        return getPrDiff(username, repoName, pr.getSourceBranch(), pr.getTargetBranch());
    }

    private CommitDiffDto buildDiffFromCommitList(String username, String repoName, List<String> commits, String message) {
        if (commits == null || commits.isEmpty()) return null;
        Map<String, CommitDiffDto.FileDiffDto> merged = new LinkedHashMap<>();
        String lastCommit = null;
        for (String c : commits) {
            if (c == null || c.isBlank()) continue;
            CommitDiffDto cd = getCommitDiff(username, repoName, c);
            if (cd == null || cd.getFiles() == null) continue;
            lastCommit = c;
            for (CommitDiffDto.FileDiffDto f : cd.getFiles()) {
                if (f == null || f.getPath() == null) continue;
                CommitDiffDto.FileDiffDto prev = merged.get(f.getPath());
                if (prev == null) {
                    merged.put(f.getPath(), CommitDiffDto.FileDiffDto.builder()
                            .path(f.getPath())
                            .status(f.getStatus())
                            .unifiedDiff(f.getUnifiedDiff())
                            .build());
                } else {
                    prev.setStatus(f.getStatus());
                    if (f.getUnifiedDiff() != null && !f.getUnifiedDiff().isBlank()) {
                        prev.setUnifiedDiff(f.getUnifiedDiff());
                    }
                }
            }
        }
        if (merged.isEmpty()) return null;
        List<CommitDiffDto.FileDiffDto> files = new ArrayList<>(merged.values());
        files.sort(Comparator.comparing(CommitDiffDto.FileDiffDto::getPath));
        return CommitDiffDto.builder()
                .commitHash(lastCommit)
                .message(message)
                .author(null)
                .timestamp(null)
                .files(files)
                .build();
    }

    private CommitDiffDto buildDiffBetweenCommits(String username, String repoName, String oldCommit, String newCommit, String message) {
        if (oldCommit == null || oldCommit.isBlank() || newCommit == null || newCommit.isBlank()) return null;
        String newTree = getTreeHashFromCommit(username, repoName, newCommit);
        String oldTree = getTreeHashFromCommit(username, repoName, oldCommit);
        if (newTree == null || oldTree == null) return null;

        Map<String, String> oldBlobs = new HashMap<>();
        collectBlobsFromTree(username, repoName, oldTree, "", oldBlobs);
        Map<String, String> newBlobs = new HashMap<>();
        collectBlobsFromTree(username, repoName, newTree, "", newBlobs);

        List<CommitDiffDto.FileDiffDto> files = new ArrayList<>();
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(oldBlobs.keySet());
        allPaths.addAll(newBlobs.keySet());
        for (String path : allPaths) {
            String oldBlob = oldBlobs.get(path);
            String newBlob = newBlobs.get(path);
            if (oldBlob == null && newBlob != null) {
                String diff = buildUnifiedDiff(username, repoName, null, newBlob, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("added").unifiedDiff(diff).build());
            } else if (oldBlob != null && newBlob == null) {
                String diff = buildUnifiedDiff(username, repoName, oldBlob, null, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("deleted").unifiedDiff(diff).build());
            } else if (oldBlob != null && newBlob != null && !oldBlob.equals(newBlob)) {
                String diff = buildUnifiedDiff(username, repoName, oldBlob, newBlob, path);
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("modified").unifiedDiff(diff).build());
            }
        }
        files.sort(Comparator.comparing(CommitDiffDto.FileDiffDto::getPath));
        return CommitDiffDto.builder()
                .commitHash(newCommit)
                .message(message)
                .author(null)
                .timestamp(null)
                .files(files)
                .build();
    }

    private static final ObjectMapper PR_MAPPER = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    /** Helper: parse a JSON array field as List<String>, or return null if absent/empty. */
    private static List<String> parseStringList(JsonNode n, String field) {
        if (!n.has(field) || !n.get(field).isArray()) return null;
        List<String> list = new ArrayList<>();
        n.get(field).forEach(e -> list.add(e.asText()));
        return list.isEmpty() ? null : list;
    }

    /**
     * Parse a single PR JSON node into PrDto.
     */
    private PrDto parsePrNode(JsonNode n, String fallbackId) {
        List<String> riskReasons = new ArrayList<>();
        if (n.has("riskReasons") && n.get("riskReasons").isArray())
            n.get("riskReasons").forEach(r -> riskReasons.add(r.asText()));

        List<String> conflictedFiles = new ArrayList<>();
        if (n.has("conflictedFiles") && n.get("conflictedFiles").isArray())
            n.get("conflictedFiles").forEach(c -> conflictedFiles.add(c.asText()));

        List<String> riskRecommendations = new ArrayList<>();
        if (n.has("riskRecommendations") && n.get("riskRecommendations").isArray())
            n.get("riskRecommendations").forEach(r -> riskRecommendations.add(r.asText()));

        List<String> commitHashes = new ArrayList<>();
        if (n.has("commitHashes") && n.get("commitHashes").isArray())
            n.get("commitHashes").forEach(c -> commitHashes.add(c.asText()));

        return PrDto.builder()
                .id(n.has("id") ? n.get("id").asText() : fallbackId)
                .sourceBranch(n.has("sourceBranch") ? n.get("sourceBranch").asText() : "")
                .targetBranch(n.has("targetBranch") ? n.get("targetBranch").asText() : "")
                .author(n.has("author") ? n.get("author").asText() : "")
                .description(n.has("description") ? n.get("description").asText(null) : null)
                .status(n.has("status") ? n.get("status").asText() : "OPEN")
                .createdTimestamp(n.has("createdTimestamp") ? n.get("createdTimestamp").asLong() : 0)
                .diffSummary(n.has("diffSummary") ? n.get("diffSummary").asText() : "")
                .hasConflicts(n.has("hasConflicts") && n.get("hasConflicts").asBoolean())
                .commitHashes(commitHashes.isEmpty() ? null : commitHashes)
                .summaryFilesChanged(n.has("summaryFilesChanged") ? n.get("summaryFilesChanged").asInt() : null)
                .summaryLinesAdded(n.has("summaryLinesAdded") ? n.get("summaryLinesAdded").asInt() : null)
                .summaryLinesRemoved(n.has("summaryLinesRemoved") ? n.get("summaryLinesRemoved").asInt() : null)
                .riskLevel(n.has("riskLevel") ? n.get("riskLevel").asText(null) : null)
                .riskReasons(riskReasons.isEmpty() ? null : riskReasons)
                .riskRecommendations(riskRecommendations.isEmpty() ? null : riskRecommendations)
                .conflictedFiles(conflictedFiles.isEmpty() ? null : conflictedFiles)
                .assignedReviewer(n.has("assignedReviewer") && !n.get("assignedReviewer").isNull() ? n.get("assignedReviewer").asText(null) : null)
                .approvedBy(n.has("approvedBy") && !n.get("approvedBy").isNull() ? n.get("approvedBy").asText(null) : null)
                .reviewedBy(n.has("reviewedBy") && !n.get("reviewedBy").isNull() ? n.get("reviewedBy").asText(null) : null)
                .rejectedBy(n.has("rejectedBy") && !n.get("rejectedBy").isNull() ? n.get("rejectedBy").asText(null) : null)
                .mergedBy(n.has("mergedBy") && !n.get("mergedBy").isNull() ? n.get("mergedBy").asText(null) : null)
                .reviewStartedAt(n.has("reviewStartedAt") && n.get("reviewStartedAt").asLong() > 0 ? n.get("reviewStartedAt").asLong() : null)
                .reviewCompletedAt(n.has("reviewCompletedAt") && n.get("reviewCompletedAt").asLong() > 0 ? n.get("reviewCompletedAt").asLong() : null)
                // Enriched risk metric fields (backward-compatible)
                .riskScore(n.has("riskScore") ? n.get("riskScore").asInt() : null)
                .fileAgeDaysMax(n.has("fileAgeDaysMax") ? n.get("fileAgeDaysMax").asInt() : null)
                .fileAgeDaysAvg(n.has("fileAgeDaysAvg") ? n.get("fileAgeDaysAvg").asInt() : null)
                .staleFiles(parseStringList(n, "staleFiles"))
                .authorDiversityCount(n.has("authorDiversityCount") ? n.get("authorDiversityCount").asInt() : null)
                .firstTimeFiles(parseStringList(n, "firstTimeFiles"))
                .testCoveragePercent(n.has("testCoveragePercent") ? n.get("testCoveragePercent").asInt() : null)
                .hotspotFiles(parseStringList(n, "hotspotFiles"))
                .criticalPatternFiles(parseStringList(n, "criticalPatternFiles"))
                .changeConcentration(n.has("changeConcentration") ? n.get("changeConcentration").asDouble() : null)
                .prType(n.has("prType") ? n.get("prType").asText(null) : null)
                .analysisTree(parseStringList(n, "analysisTree"))
                .aiFindings(parseStringList(n, "aiFindings"))
                .aiScoreDelta(n.has("aiScoreDelta") ? n.get("aiScoreDelta").asInt() : null)
                .build();
    }

    /**
     * List PRs from HDFS repo/.pr/ (PR-001.json, PR-002.json ...).
     */
    public List<PrDto> getPullRequests(String username, String repoName) {
        List<PrDto> prs = new ArrayList<>();
        Path prDir = new Path(basePath + "/" + username + "/" + repoName + "/.pr");
        ObjectMapper mapper = new ObjectMapper();
        try {
            if (!fileSystem.exists(prDir)) {
                log.debug("PR directory does not exist: {}", prDir);
                return prs;
            }
            FileStatus[] statuses = fileSystem.listStatus(prDir);
            for (FileStatus status : statuses) {
                if (status.isFile() && status.getPath().getName().endsWith(".json")) {
                    String content = readFileContent(status.getPath());
                    if (content == null) continue;
                    try {
                        JsonNode n = mapper.readTree(content);
                        String fallbackId = status.getPath().getName().replace(".json", "");
                        PrDto pr = parsePrNode(n, fallbackId);
                        refreshPrMergeConflictState(username, repoName, pr);
                        prs.add(pr);
                    } catch (Exception e) {
                        log.debug("Failed to parse PR file {}: {}", status.getPath(), e.getMessage());
                    }
                }
            }
            prs.sort((a, b) -> Long.compare(b.getCreatedTimestamp(), a.getCreatedTimestamp()));
        } catch (Exception e) {
            log.error("Failed to list PRs for {}/{}: {}", username, repoName, e.getMessage());
        }
        return prs;
    }

    /**
     * Create a new Pull Request directly on HDFS (from UI).
     * Performs 3-way conflict detection and rule-based risk analysis.
     */
    public PrDto createPullRequest(String username, String repoName,
                                   String sourceBranch, String targetBranch,
                                   String author, String description, String prType) {
        return createPullRequest(username, repoName, sourceBranch, targetBranch, author, description, prType, null);
    }

    public PrDto createPullRequest(String username, String repoName,
                                   String sourceBranch, String targetBranch,
                                   String author, String description, String prType, String assignedReviewer) {
        // Validate branches
        String sourceCommit = getCommitHashForBranch(username, repoName, sourceBranch);
        String targetCommit = getCommitHashForBranch(username, repoName, targetBranch);
        if (sourceCommit == null)
            throw new IllegalArgumentException("Source branch not found: " + sourceBranch);
        if (targetCommit == null)
            throw new IllegalArgumentException("Target branch not found: " + targetBranch);
        if (sourceCommit.equals(targetCommit))
            throw new IllegalArgumentException("Source and target branches point to the same commit. Nothing to merge.");

        // Collect blobs from each branch
        String sourceTree = getTreeHashFromCommit(username, repoName, sourceCommit);
        String targetTree = getTreeHashFromCommit(username, repoName, targetCommit);
        Map<String, String> sourceBlobs = new HashMap<>();
        Map<String, String> targetBlobs = new HashMap<>();
        if (sourceTree != null) collectBlobsFromTree(username, repoName, sourceTree, "", sourceBlobs);
        if (targetTree != null) collectBlobsFromTree(username, repoName, targetTree, "", targetBlobs);

        // Find common ancestor and its blobs (for 3-way conflict detection)
        String ancestorCommit = findCommonAncestor(username, repoName, sourceCommit, targetCommit);
        Map<String, String> ancestorBlobs = new HashMap<>();
        if (ancestorCommit != null) {
            String ancestorTree = getTreeHashFromCommit(username, repoName, ancestorCommit);
            if (ancestorTree != null) collectBlobsFromTree(username, repoName, ancestorTree, "", ancestorBlobs);
        }

        // Compute diff stats and conflict files
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(sourceBlobs.keySet());
        allPaths.addAll(targetBlobs.keySet());

        List<String> conflictedFiles = new ArrayList<>();
        List<String> changedFiles = new ArrayList<>();
        int linesAdded = 0, linesRemoved = 0;

        for (String path : allPaths) {
            String s = sourceBlobs.get(path);
            String t = targetBlobs.get(path);
            String a = ancestorBlobs.get(path); // null if ancestor doesn't have this file

            boolean sourceChanged = !java.util.Objects.equals(s, a);
            boolean targetChanged = !java.util.Objects.equals(t, a);

            if (sourceChanged) {
                changedFiles.add(path);
                // Count lines in source blob
                if (s != null) {
                    byte[] content = readBlobContent(username, repoName, s);
                    if (content != null && RepoFileService.isTextFile(path)) {
                        linesAdded += countLines(new String(content, StandardCharsets.UTF_8));
                    }
                }
                if (a != null) {
                    byte[] oldContent = readBlobContent(username, repoName, a);
                    if (oldContent != null && RepoFileService.isTextFile(path)) {
                        linesRemoved += countLines(new String(oldContent, StandardCharsets.UTF_8));
                    }
                }

                // 3-way conflict: both sides changed same file differently
                if (targetChanged && !java.util.Objects.equals(s, t)) {
                    conflictedFiles.add(path);
                }
            }
        }

        int totalFilesChanged = changedFiles.size();

        // ── Enriched Risk Analysis (8 metrics + PR type + AI) ────────────────
        EnrichedRiskResult risk = computeEnrichedRisk(
            username, repoName,
            changedFiles, linesAdded, linesRemoved,
            !conflictedFiles.isEmpty(), conflictedFiles,
            targetCommit, author,
            sourceBlobs.keySet(),
            prType
        );

        // Get commits in source not in target
        List<String> commitHashes = getCommitsInSource(username, repoName, sourceCommit, targetCommit, 20);

        String diffSummary = "Files: " + totalFilesChanged + ", +" + linesAdded + " -" + linesRemoved +
                (conflictedFiles.isEmpty() ? "" : ", conflicts: " + conflictedFiles.size()) +
                ", risk-score: " + risk.riskScore;

        // Generate PR ID
        String prId = getNextPrId(username, repoName);
        long now = System.currentTimeMillis();

        // Build JSON (all existing + new enriched fields)
        ObjectNode prJson = PR_MAPPER.createObjectNode();
        prJson.put("id", prId);
        prJson.put("author", author);
        prJson.put("sourceBranch", sourceBranch);
        prJson.put("targetBranch", targetBranch);
        prJson.put("createdTimestamp", now);
        prJson.put("status", "OPEN");
        if (description != null && !description.isBlank()) prJson.put("description", description);
        if (prType != null && !prType.isBlank()) prJson.put("prType", prType);
        if (assignedReviewer != null && !assignedReviewer.isBlank()) prJson.put("assignedReviewer", assignedReviewer);
        prJson.put("diffSummary", diffSummary);
        prJson.put("hasConflicts", !conflictedFiles.isEmpty());
        prJson.putPOJO("conflictedFiles", conflictedFiles);
        prJson.putPOJO("commitHashes", commitHashes);
        prJson.put("summaryFilesChanged", totalFilesChanged);
        prJson.put("summaryLinesAdded", linesAdded);
        prJson.put("summaryLinesRemoved", linesRemoved);
        prJson.put("riskLevel", risk.riskLevel);
        prJson.putPOJO("riskReasons", risk.reasons);
        prJson.putPOJO("riskRecommendations", risk.recommendations);
        // Enriched metric fields
        prJson.put("riskScore", risk.riskScore);
        prJson.put("fileAgeDaysMax", risk.fileAgeDaysMax);
        prJson.put("fileAgeDaysAvg", risk.fileAgeDaysAvg);
        prJson.putPOJO("staleFiles", risk.staleFiles);
        prJson.put("authorDiversityCount", risk.authorDiversityCount);
        prJson.putPOJO("firstTimeFiles", risk.firstTimeFiles);
        prJson.put("testCoveragePercent", risk.testCoveragePercent);
        prJson.putPOJO("hotspotFiles", risk.hotspotFiles);
        prJson.putPOJO("criticalPatternFiles", risk.criticalPatternFiles);
        prJson.put("changeConcentration", risk.changeConcentration);
        prJson.putPOJO("analysisTree", risk.analysisTree);
        prJson.putPOJO("aiFindings", risk.aiFindings);
        prJson.put("aiScoreDelta", risk.aiScoreDelta);

        // Save to HDFS
        Path prDir = new Path(basePath + "/" + username + "/" + repoName + "/.pr");
        Path prPath = new Path(prDir + "/" + prId + ".json");
        try {
            if (!fileSystem.exists(prDir)) fileSystem.mkdirs(prDir);
            byte[] bytes = PR_MAPPER.writeValueAsBytes(prJson);
            try (FSDataOutputStream out = fileSystem.create(prPath, true)) {
                out.write(bytes);
            }
        } catch (Exception e) {
            log.error("Failed to save PR {} to HDFS: {}", prId, e.getMessage());
            throw new RuntimeException("Failed to create PR: " + e.getMessage());
        }

        return PrDto.builder()
                .id(prId)
                .sourceBranch(sourceBranch)
                .targetBranch(targetBranch)
                .author(author)
                .description(description)
                .status("OPEN")
                .createdTimestamp(now)
                .commitHashes(commitHashes.isEmpty() ? null : commitHashes)
                .diffSummary(diffSummary)
                .hasConflicts(!conflictedFiles.isEmpty())
                .conflictedFiles(conflictedFiles.isEmpty() ? null : conflictedFiles)
                .summaryFilesChanged(totalFilesChanged)
                .summaryLinesAdded(linesAdded)
                .summaryLinesRemoved(linesRemoved)
                .riskLevel(risk.riskLevel)
                .riskReasons(risk.reasons.isEmpty() ? null : risk.reasons)
                .riskRecommendations(risk.recommendations.isEmpty() ? null : risk.recommendations)
                .riskScore(risk.riskScore)
                .fileAgeDaysMax(risk.fileAgeDaysMax)
                .fileAgeDaysAvg(risk.fileAgeDaysAvg)
                .staleFiles(risk.staleFiles.isEmpty() ? null : risk.staleFiles)
                .authorDiversityCount(risk.authorDiversityCount)
                .firstTimeFiles(risk.firstTimeFiles.isEmpty() ? null : risk.firstTimeFiles)
                .testCoveragePercent(risk.testCoveragePercent)
                .hotspotFiles(risk.hotspotFiles.isEmpty() ? null : risk.hotspotFiles)
                .criticalPatternFiles(risk.criticalPatternFiles.isEmpty() ? null : risk.criticalPatternFiles)
                .changeConcentration(risk.changeConcentration)
                .prType(prType)
                .assignedReviewer(assignedReviewer)
                .analysisTree(risk.analysisTree.isEmpty() ? null : risk.analysisTree)
                .aiFindings(risk.aiFindings.isEmpty() ? null : risk.aiFindings)
                .aiScoreDelta(risk.aiScoreDelta > 0 ? risk.aiScoreDelta : null)
                .build();
    }

    /** Find common ancestor commit of two commits using BFS (handles merge commits with multiple parents). */
    private String findCommonAncestor(String username, String repoName, String commit1, String commit2) {
        Set<String> ancestors1 = new LinkedHashSet<>();
        java.util.Deque<String> q1 = new java.util.ArrayDeque<>();
        q1.add(commit1);
        while (!q1.isEmpty() && ancestors1.size() < 500) {
            String c = q1.poll();
            if (c == null || ancestors1.contains(c)) continue;
            ancestors1.add(c);
            for (String p : getParentHashesFromCommit(username, repoName, c)) q1.add(p);
        }
        // BFS from commit2, return first commit found in ancestors1
        java.util.Deque<String> q2 = new java.util.ArrayDeque<>();
        q2.add(commit2);
        Set<String> visited = new HashSet<>();
        while (!q2.isEmpty()) {
            String c = q2.poll();
            if (c == null || visited.contains(c)) continue;
            if (ancestors1.contains(c)) return c;
            visited.add(c);
            for (String p : getParentHashesFromCommit(username, repoName, c)) q2.add(p);
        }
        return null;
    }

    /** Collect commits reachable from sourceCommit but not from targetCommit (max limit). */
    private List<String> getCommitsInSource(String username, String repoName,
                                             String sourceCommit, String targetCommit, int limit) {
        // Collect all commits reachable from target
        Set<String> targetAncestors = new HashSet<>();
        java.util.Deque<String> tq = new java.util.ArrayDeque<>();
        tq.add(targetCommit);
        while (!tq.isEmpty() && targetAncestors.size() < 1000) {
            String c = tq.poll();
            if (c == null || targetAncestors.contains(c)) continue;
            targetAncestors.add(c);
            for (String p : getParentHashesFromCommit(username, repoName, c)) tq.add(p);
        }
        // Walk source, collect commits not in target
        List<String> result = new ArrayList<>();
        java.util.Deque<String> sq = new java.util.ArrayDeque<>();
        sq.add(sourceCommit);
        Set<String> visited = new HashSet<>();
        while (!sq.isEmpty() && result.size() < limit) {
            String c = sq.poll();
            if (c == null || visited.contains(c) || targetAncestors.contains(c)) continue;
            visited.add(c);
            result.add(c);
            for (String p : getParentHashesFromCommit(username, repoName, c)) sq.add(p);
        }
        return result;
    }

    /** Generate next PR-xxx id by scanning existing PR files. */
    private String getNextPrId(String username, String repoName) {
        Path prDir = new Path(basePath + "/" + username + "/" + repoName + "/.pr");
        int maxId = 0;
        try {
            if (fileSystem.exists(prDir)) {
                FileStatus[] statuses = fileSystem.listStatus(prDir);
                for (FileStatus s : statuses) {
                    String name = s.getPath().getName();
                    if (name.matches("PR-\\d+\\.json")) {
                        int id = Integer.parseInt(name.replace("PR-", "").replace(".json", ""));
                        maxId = Math.max(maxId, id);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not determine next PR id: {}", e.getMessage());
        }
        return "PR-" + String.format("%03d", maxId + 1);
    }

    /** Count newline-delimited lines in a string. */
    private int countLines(String text) {
        if (text == null || text.isEmpty()) return 0;
        int count = 1;
        for (char c : text.toCharArray()) if (c == '\n') count++;
        return count;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ENRICHED RISK ANALYSIS — 8 metrics
    // ═══════════════════════════════════════════════════════════════════

    /** Per-file statistics gathered by walking commit history. */
    private static class FileHistoryStats {
        long lastModifiedMs = 0;
        String lastModifiedAuthor = "";
        int changeCount = 0;
        final Set<String> uniqueAuthors = new LinkedHashSet<>();
        boolean prAuthorTouchedBefore = false;
    }

    /** Aggregated result of the enriched risk computation. */
    private static class EnrichedRiskResult {
        int riskScore = 0;
        String riskLevel = "LOW";
        String prType = null;
        final List<String> reasons = new ArrayList<>();
        final List<String> recommendations = new ArrayList<>();
        // Metric fields exposed to callers
        int fileAgeDaysMax = 0;
        int fileAgeDaysAvg = 0;
        final List<String> staleFiles = new ArrayList<>();
        int authorDiversityCount = 0;
        final List<String> firstTimeFiles = new ArrayList<>();
        int testCoveragePercent = 100;
        final List<String> hotspotFiles = new ArrayList<>();
        final List<String> criticalPatternFiles = new ArrayList<>();
        double changeConcentration = 0.0;
        // Analysis tree: "icon:::metric:::delta:::reason"
        final List<String> analysisTree = new ArrayList<>();
        // AI findings: "SEVERITY:::CATEGORY:::description:::scoreDelta"
        final List<String> aiFindings = new ArrayList<>();
        int aiScoreDelta = 0;
    }

    /** PR type metadata for score/icon/description lookup. */
    private static final Map<String, int[]> PR_TYPE_DELTA = Map.of(
        "BUG_FIX",       new int[]{10},
        "HOTFIX",        new int[]{20},
        "NEW_FEATURE",   new int[]{5},
        "REFACTOR",      new int[]{12},
        "PERFORMANCE",   new int[]{5},
        "SECURITY",      new int[]{20},
        "DOCUMENTATION", new int[]{-15},
        "CHORE",         new int[]{-10}
    );
    private static final Map<String, String> PR_TYPE_ICON = Map.of(
        "BUG_FIX",       "🐛",
        "HOTFIX",        "🚨",
        "NEW_FEATURE",   "✨",
        "REFACTOR",      "🔧",
        "PERFORMANCE",   "⚡",
        "SECURITY",      "🔒",
        "DOCUMENTATION", "📝",
        "CHORE",         "🛠"
    );
    private static final Map<String, String> PR_TYPE_REASON = Map.of(
        "BUG_FIX",       "Bug fix: fixing defects risks introducing regressions in adjacent code",
        "HOTFIX",        "Hotfix: emergency patches under time pressure have the highest regression risk",
        "NEW_FEATURE",   "New feature: new code paths are less battle-tested and may have edge cases",
        "REFACTOR",      "Refactor: restructuring code risks unintentional behavior changes",
        "PERFORMANCE",   "Performance: optimizations can have unexpected side effects",
        "SECURITY",      "Security fix: security changes require mandatory expert review",
        "DOCUMENTATION", "Documentation only: very low risk change",
        "CHORE",         "Chore/config: routine maintenance with limited functional impact"
    );

    /** Add a scored node to the analysis tree (does NOT modify riskScore — caller does that). */
    private static void treeNode(EnrichedRiskResult r, String icon, String metric, int delta, String reason) {
        r.analysisTree.add(icon + ":::" + metric + ":::" + delta + ":::" + reason);
    }

    /**
     * Walk up to {@code maxCommits} from {@code headCommit} (first-parent chain).
     * For each target file, records when it last changed, how often, and who touched it.
     */
    private Map<String, FileHistoryStats> walkFileHistory(
            String username, String repoName,
            String headCommit, List<String> targetFiles, String prAuthor, int maxCommits) {

        Map<String, FileHistoryStats> stats = new LinkedHashMap<>();
        for (String f : targetFiles) stats.put(f, new FileHistoryStats());

        // Build first-parent commit chain
        // chain[i] = { commitHash, parentHash, author, timestampMs, treeHash }
        List<String[]> chain = new ArrayList<>();
        String current = headCommit;
        Set<String> seen = new HashSet<>();

        for (int i = 0; i < maxCommits && current != null && !seen.contains(current); i++) {
            seen.add(current);
            String raw = readCommitObject(username, repoName, current);
            if (raw == null) break;

            String treeHash = null, parentHash = null, author = "";
            long ts = 0;
            for (String line : raw.split("\\r?\\n")) {
                if (line.startsWith("tree "))   treeHash   = line.substring(5).trim();
                else if (line.startsWith("parent ")) parentHash = line.substring(7).trim();
            }
            Matcher am = Pattern.compile("author\\s+(.+?)\\s+(\\d+)", Pattern.MULTILINE).matcher(raw);
            if (am.find()) {
                String af = am.group(1).trim();
                int ei = af.indexOf(" <");
                author = ei > 0 ? af.substring(0, ei) : af;
                try { ts = Long.parseLong(am.group(2)) * 1000L; } catch (Exception ignored) {}
            }
            chain.add(new String[]{current, parentHash, author, String.valueOf(ts), treeHash});
            current = parentHash;
        }

        // Compare consecutive commits to detect file changes
        for (int i = 0; i < chain.size(); i++) {
            String[] curr = chain.get(i);
            String author    = curr[2];
            long   ts        = Long.parseLong(curr[3]);
            String treeHash  = curr[4];
            String parentTree = (i + 1 < chain.size()) ? chain.get(i + 1)[4] : null;

            for (String file : targetFiles) {
                String currBlob   = treeHash   != null ? findBlobInTree(username, repoName, treeHash,   file) : null;
                String parentBlob = parentTree != null ? findBlobInTree(username, repoName, parentTree, file) : null;

                if (currBlob != null && !currBlob.equals(parentBlob)) {
                    FileHistoryStats s = stats.get(file);
                    if (s.lastModifiedMs == 0) {
                        s.lastModifiedMs     = ts;
                        s.lastModifiedAuthor = author;
                    }
                    s.changeCount++;
                    s.uniqueAuthors.add(author);
                    if (!author.isEmpty() &&
                        (author.equalsIgnoreCase(prAuthor) ||
                         author.toLowerCase().contains(prAuthor.toLowerCase()) ||
                         prAuthor.toLowerCase().contains(author.toLowerCase()))) {
                        s.prAuthorTouchedBefore = true;
                    }
                }
            }
        }
        return stats;
    }

    /** Keywords that indicate security/config sensitivity in file paths. */
    private static final List<String> CRITICAL_KEYWORDS = List.of(
        "auth", "security", "password", "secret", "token", "crypto", "encrypt",
        "ssl", "cert", "login", "session", "permission", "privilege", "oauth"
    );
    private static final List<String> CRITICAL_EXTENSIONS = List.of(
        ".env", ".pem", ".key", ".crt", ".p12", ".pfx", ".jks", ".keystore"
    );
    private static final List<String> DEPENDENCY_FILES = List.of(
        "pom.xml", "package.json", "build.gradle", "requirements.txt",
        "go.mod", "cargo.toml", "Gemfile", "pyproject.toml", "package-lock.json"
    );

    /**
     * Runs all 8 enriched risk metrics and returns a scored result.
     *
     * <pre>
     * Metric 1 — Change Volume (lines + files)
     * Metric 2 — Change Concentration (lines / file)
     * Metric 3 — Critical Pattern Detection (security-sensitive paths)
     * Metric 4 — Test Coverage Ratio (source files with test counterparts)
     * Metric 5 — File Age (days since last modification in target history)
     * Metric 6 — Author Diversity & Knowledge Concentration
     * Metric 7 — First-Time Contributor (no prior history in these files)
     * Metric 8 — Hotspot Detection (churn ≥ 6 in recent history)
     * + Bonus: Merge Conflicts, Dependency Changes
     * </pre>
     */
    private EnrichedRiskResult computeEnrichedRisk(
            String username, String repoName,
            List<String> changedFiles, int linesAdded, int linesRemoved,
            boolean hasConflicts, List<String> conflictedFiles,
            String targetCommit, String prAuthor,
            Set<String> allSourcePaths,
            String prType) {

        EnrichedRiskResult r = new EnrichedRiskResult();
        r.prType = prType;
        long nowMs = System.currentTimeMillis();
        int totalFiles = changedFiles.size();
        int totalLines = linesAdded + linesRemoved;

        // ── Metric 0: PR Type ────────────────────────────────────────────────
        if (prType != null && !prType.isBlank() && PR_TYPE_DELTA.containsKey(prType)) {
            int typeDelta = PR_TYPE_DELTA.get(prType)[0];
            String typeReason = PR_TYPE_REASON.getOrDefault(prType, "PR type: " + prType);
            String typeIcon   = PR_TYPE_ICON.getOrDefault(prType, "📋");
            String typeLabel  = prType.replace('_', ' ');
            r.riskScore += typeDelta;
            if (typeDelta > 0) r.reasons.add(typeReason);
            treeNode(r, typeIcon, "PR Type: " + typeLabel, typeDelta, typeReason);
        }

        // ── Bonus: Merge Conflicts ────────────────────────────────────────────
        if (hasConflicts) {
            int delta = 30;
            String cfStr = String.join(", ", conflictedFiles.subList(0, Math.min(3, conflictedFiles.size())))
                           + (conflictedFiles.size() > 3 ? " …" : "");
            String reason = "Merge conflicts in " + conflictedFiles.size() + " file(s): " + cfStr;
            r.riskScore += delta;
            r.reasons.add(reason);
            r.recommendations.add("Resolve all conflicts using 'vega merge' before merging");
            treeNode(r, "⚔️", "Merge Conflicts", delta, reason);
        }

        // ── Metric 1: Change Volume ───────────────────────────────────────────
        if (totalLines > 500) {
            int delta = 20;
            String reason = "Large change volume: " + totalLines + " lines affected across " + totalFiles + " file(s)";
            r.riskScore += delta;
            r.reasons.add(reason);
            r.recommendations.add("Consider splitting into smaller, focused PRs");
            treeNode(r, "📦", "Change Volume (lines)", delta, reason);
        } else if (totalLines > 150) {
            int delta = 10;
            String reason = "Moderate change volume: " + totalLines + " lines affected";
            r.riskScore += delta;
            r.reasons.add(reason);
            treeNode(r, "📦", "Change Volume (lines)", delta, reason);
        } else {
            treeNode(r, "📦", "Change Volume (lines)", 0, "Small change: " + totalLines + " lines — low volume risk");
        }

        if (totalFiles > 10) {
            int delta = 15;
            String reason = "High breadth: " + totalFiles + " files changed — possible shotgun pattern";
            r.riskScore += delta;
            r.reasons.add(reason);
            r.recommendations.add("Verify all changes belong to the same concern");
            treeNode(r, "📂", "Files Changed (breadth)", delta, reason);
        } else if (totalFiles > 5) {
            int delta = 5;
            String reason = "Multiple files changed: " + totalFiles;
            r.riskScore += delta;
            r.reasons.add(reason);
            treeNode(r, "📂", "Files Changed (breadth)", delta, reason);
        } else {
            treeNode(r, "📂", "Files Changed (breadth)", 0, totalFiles + " files — focused change");
        }

        // ── Metric 2: Change Concentration ───────────────────────────────────
        if (totalFiles > 0) {
            r.changeConcentration = (double) totalLines / totalFiles;
            if (r.changeConcentration > 150) {
                int delta = 10;
                String reason = "High change concentration: avg " + String.format("%.0f", r.changeConcentration) + " lines/file — deep, concentrated change";
                r.riskScore += delta;
                r.reasons.add(reason);
                treeNode(r, "📐", "Change Concentration", delta, reason);
            } else {
                treeNode(r, "📐", "Change Concentration", 0, String.format("%.0f", r.changeConcentration) + " lines/file — acceptable concentration");
            }
        }

        // ── Metric 3: Critical Pattern Detection ─────────────────────────────
        for (String file : changedFiles) {
            String lower = file.toLowerCase();
            boolean isCritical = CRITICAL_EXTENSIONS.stream().anyMatch(lower::endsWith) ||
                CRITICAL_KEYWORDS.stream().anyMatch(lower::contains);
            if (isCritical) r.criticalPatternFiles.add(file);
        }
        if (!r.criticalPatternFiles.isEmpty()) {
            int delta = 25;
            String reason = "Security-sensitive file(s) changed: " +
                String.join(", ", r.criticalPatternFiles.subList(0, Math.min(3, r.criticalPatternFiles.size()))) +
                (r.criticalPatternFiles.size() > 3 ? " …" : "");
            r.riskScore += delta;
            r.reasons.add(reason);
            r.recommendations.add("Security review required — involve a security-aware reviewer");
            treeNode(r, "🔐", "Security-Sensitive Files", delta, reason);
        } else {
            treeNode(r, "🔐", "Security-Sensitive Files", 0, "No security-sensitive paths detected");
        }

        // ── Bonus: Dependency Files ───────────────────────────────────────────
        long depChanged = changedFiles.stream().filter(f ->
            DEPENDENCY_FILES.stream().anyMatch(d -> f.equals(d) || f.endsWith("/" + d))).count();
        if (depChanged > 0) {
            int delta = 10;
            String reason = "Dependency manifest changed — downstream impact possible";
            r.riskScore += delta;
            r.reasons.add(reason);
            r.recommendations.add("Run full dependency audit and integration tests");
            treeNode(r, "📦", "Dependency Manifest", delta, reason);
        }

        // ── Metric 4: Test Coverage Ratio ────────────────────────────────────
        int sourceFileCount = 0, testedCount = 0;
        List<String> untestedFiles = new ArrayList<>();
        for (String file : changedFiles) {
            String lower = file.toLowerCase();
            if (lower.matches(".*\\.(java|py|js|ts|go|rb|cpp|c|cs|kt|scala|rs)$")
                    && !lower.contains("test") && !lower.contains("spec")) {
                sourceFileCount++;
                String base = file.contains("/") ? file.substring(file.lastIndexOf('/') + 1) : file;
                String stem = base.contains(".") ? base.substring(0, base.lastIndexOf('.')) : base;
                boolean hasTest = allSourcePaths.stream().anyMatch(p -> {
                    String pl = p.toLowerCase();
                    return (pl.contains("test") || pl.contains("spec")) && pl.contains(stem.toLowerCase());
                });
                if (hasTest) testedCount++; else untestedFiles.add(file);
            }
        }
        if (sourceFileCount > 0) {
            r.testCoveragePercent = (int) ((double) testedCount / sourceFileCount * 100);
            if (r.testCoveragePercent < 30 && sourceFileCount >= 2) {
                int delta = 15;
                String reason = "Low test coverage: only " + r.testCoveragePercent + "% of changed source files have test counterparts";
                r.riskScore += delta;
                r.reasons.add(reason);
                r.recommendations.add("Add tests for: " +
                    String.join(", ", untestedFiles.subList(0, Math.min(3, untestedFiles.size()))));
                treeNode(r, "🧪", "Test Coverage", delta, reason);
            } else if (r.testCoveragePercent < 60 && sourceFileCount >= 3) {
                int delta = 7;
                String reason = "Partial test coverage: " + r.testCoveragePercent + "% of changed files covered by tests";
                r.riskScore += delta;
                r.reasons.add(reason);
                treeNode(r, "🧪", "Test Coverage", delta, reason);
            } else {
                treeNode(r, "🧪", "Test Coverage", 0, r.testCoveragePercent + "% of changed source files have tests");
            }
        }

        // ── Metrics 5-8: File History Analysis ───────────────────────────────
        if (!changedFiles.isEmpty() && targetCommit != null) {
            Map<String, FileHistoryStats> hist = walkFileHistory(
                username, repoName, targetCommit, changedFiles, prAuthor, 80);

            // Metric 5: File Age
            long totalAgeDays = 0; int ageCount = 0;
            for (Map.Entry<String, FileHistoryStats> e : hist.entrySet()) {
                FileHistoryStats s = e.getValue();
                if (s.lastModifiedMs > 0) {
                    long days = (nowMs - s.lastModifiedMs) / 86_400_000L;
                    r.fileAgeDaysMax = (int) Math.max(r.fileAgeDaysMax, days);
                    totalAgeDays += days; ageCount++;
                    if (days > 90) r.staleFiles.add(e.getKey());
                } else if (s.changeCount == 0) {
                    r.staleFiles.add(e.getKey());
                }
            }
            if (ageCount > 0) r.fileAgeDaysAvg = (int) (totalAgeDays / ageCount);

            if (!r.staleFiles.isEmpty()) {
                int delta = Math.min(20, 5 + r.staleFiles.size() * 3);
                String reason = "Stale file(s) modified: " + r.staleFiles.size() + " file(s) last touched " +
                    r.fileAgeDaysMax + "+ days ago — higher regression risk for dormant code";
                r.riskScore += delta;
                r.reasons.add(reason);
                r.recommendations.add("Extra care required when modifying long-untouched files");
                treeNode(r, "⏱", "File Age (staleness)", delta, reason);
            } else {
                treeNode(r, "⏱", "File Age (staleness)", 0,
                    ageCount > 0 ? "Max " + r.fileAgeDaysMax + "d, avg " + r.fileAgeDaysAvg + "d — recently active files" : "No prior history found");
            }

            // Metric 6: Author Diversity & Knowledge Concentration
            Set<String> allAuthors = new LinkedHashSet<>();
            hist.values().forEach(s -> allAuthors.addAll(s.uniqueAuthors));
            r.authorDiversityCount = allAuthors.size();
            if (allAuthors.size() == 1 && totalFiles >= 3) {
                int delta = 8;
                String reason = "Knowledge concentration: all recently-changed files belong to a single author — bus-factor risk";
                r.riskScore += delta;
                r.reasons.add(reason);
                treeNode(r, "👥", "Author Diversity", delta, reason);
            } else if (allAuthors.size() >= 5) {
                int delta = 5;
                String reason = "High author diversity: " + allAuthors.size() + " authors previously modified these files — coordination risk";
                r.riskScore += delta;
                r.reasons.add(reason);
                treeNode(r, "👥", "Author Diversity", delta, reason);
            } else {
                treeNode(r, "👥", "Author Diversity", 0, r.authorDiversityCount + " author(s) in file history — healthy");
            }

            // Metric 7: First-Time Contributor files
            for (Map.Entry<String, FileHistoryStats> e : hist.entrySet()) {
                if (!e.getValue().prAuthorTouchedBefore && e.getValue().changeCount > 0) {
                    r.firstTimeFiles.add(e.getKey());
                }
            }
            if (!r.firstTimeFiles.isEmpty()) {
                int delta = Math.min(15, r.firstTimeFiles.size() * 4);
                String reason = "First-time contribution to " + r.firstTimeFiles.size() + " file(s): PR author has no prior history in these files";
                r.riskScore += delta;
                r.reasons.add(reason);
                r.recommendations.add("Pair review recommended for unfamiliar files: " +
                    String.join(", ", r.firstTimeFiles.subList(0, Math.min(3, r.firstTimeFiles.size()))));
                treeNode(r, "🆕", "First-Time Files", delta, reason);
            } else {
                treeNode(r, "🆕", "First-Time Files", 0, "PR author has prior history in all changed files");
            }

            // Metric 8: Hotspot Detection
            for (Map.Entry<String, FileHistoryStats> e : hist.entrySet()) {
                if (e.getValue().changeCount >= 6) r.hotspotFiles.add(e.getKey());
            }
            if (!r.hotspotFiles.isEmpty()) {
                int delta = Math.min(15, r.hotspotFiles.size() * 4);
                String reason = "Hotspot file(s) detected: " + r.hotspotFiles.size() + " file(s) changed ≥6 times recently — potentially unstable area";
                r.riskScore += delta;
                r.reasons.add(reason);
                r.recommendations.add("Review recent commit history on hotspot: " +
                    String.join(", ", r.hotspotFiles.subList(0, Math.min(2, r.hotspotFiles.size()))));
                treeNode(r, "🔥", "Hotspot Files", delta, reason);
            } else {
                treeNode(r, "🔥", "Hotspot Files", 0, "No hotspot files (≥6 changes) detected");
            }
        }

        // ── Derive intermediate Risk Level before AI ──────────────────────────
        r.riskLevel = r.riskScore >= 45 ? "HIGH" : r.riskScore >= 18 ? "MEDIUM" : "LOW";

        // ── AI Analysis ───────────────────────────────────────────────────────
        try {
            callAgentForPrAnalysis(r, username, repoName, changedFiles, linesAdded, linesRemoved);
        } catch (Exception e) {
            log.warn("AI analysis skipped for PR in {}/{}: {}", username, repoName, e.getMessage());
            treeNode(r, "🤖", "AI Review", 0, "AI analysis skipped: " + e.getMessage());
        }

        // ── Re-derive Risk Level (post AI) ────────────────────────────────────
        r.riskLevel = r.riskScore >= 45 ? "HIGH" : r.riskScore >= 18 ? "MEDIUM" : "LOW";

        if (r.recommendations.isEmpty()) {
            r.recommendations.add("Changes look well-scoped; standard review process applies");
        }
        return r;
    }

    /**
     * Calls the agent service for AI PR analysis and mutates the result with AI findings + tree nodes.
     */
    private void callAgentForPrAnalysis(EnrichedRiskResult r, String username, String repoName,
                                         List<String> changedFiles, int linesAdded, int linesRemoved) {
        String url = agentServiceUrl + "/api/agent/pr-analysis";
        java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
            .connectTimeout(java.time.Duration.ofSeconds(10))
            .build();

        // Build request JSON manually (avoid adding Jackson dep for simple object)
        StringBuilder reqJson = new StringBuilder("{");
        reqJson.append("\"repositoryName\":\"").append(escJson(repoName)).append("\",");
        reqJson.append("\"author\":\"").append(escJson(username)).append("\",");
        reqJson.append("\"linesAdded\":").append(linesAdded).append(",");
        reqJson.append("\"linesRemoved\":").append(linesRemoved).append(",");
        reqJson.append("\"riskLevel\":\"").append(r.riskLevel).append("\",");
        if (r.prType != null) reqJson.append("\"prType\":\"").append(r.prType).append("\",");
        reqJson.append("\"filesChanged\":[");
        for (int i = 0; i < changedFiles.size(); i++) {
            if (i > 0) reqJson.append(",");
            reqJson.append("\"").append(escJson(changedFiles.get(i))).append("\"");
        }
        reqJson.append("],\"riskReasons\":[");
        List<String> reasons = r.reasons;
        for (int i = 0; i < reasons.size(); i++) {
            if (i > 0) reqJson.append(",");
            reqJson.append("\"").append(escJson(reasons.get(i))).append("\"");
        }
        reqJson.append("]}");

        java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
            .uri(java.net.URI.create(url))
            .header("Content-Type", "application/json")
            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(reqJson.toString()))
            .timeout(java.time.Duration.ofSeconds(30))
            .build();

        try {
            java.net.http.HttpResponse<String> resp = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                String body = resp.body();
                // Parse findings from JSON response
                // findings field: ["SEVERITY:::CATEGORY:::description:::delta", ...]
                java.util.regex.Pattern findPat = java.util.regex.Pattern.compile(
                    "\"findings\"\\s*:\\s*\\[([^\\]]*?)\\]", java.util.regex.Pattern.DOTALL);
                java.util.regex.Matcher fm = findPat.matcher(body);
                if (fm.find()) {
                    String arr = fm.group(1);
                    java.util.regex.Matcher entryM = java.util.regex.Pattern
                        .compile("\"((?:[^\"\\\\]|\\\\.)*?)\"").matcher(arr);
                    while (entryM.find()) {
                        String entry = entryM.group(1).replace("\\n", "\n").replace("\\\"", "\"").replace("\\\\", "\\");
                        if (entry.contains(":::")) {
                            r.aiFindings.add(entry);
                            // Parse delta from entry "SEV:::CAT:::desc:::delta"
                            String[] parts = entry.split(":::", 4);
                            int delta = 0;
                            if (parts.length >= 4) {
                                try { delta = Integer.parseInt(parts[3].trim()); } catch (Exception ignored) {}
                            }
                            // Don't add score for SCORE=0 findings
                            if (delta > 0) {
                                r.riskScore += delta;
                                r.aiScoreDelta += delta;
                                String sev = parts.length > 0 ? parts[0] : "?";
                                String cat = parts.length > 1 ? parts[1] : "?";
                                String desc = parts.length > 2 ? parts[2] : entry;
                                String aiReason = "[" + sev + "/" + cat + "] " + desc;
                                r.reasons.add("AI: " + aiReason);
                                treeNode(r, "🤖", "AI: " + cat, delta, aiReason);
                            }
                        }
                    }
                }
                // If no findings parsed yet, add a baseline node
                if (r.aiFindings.isEmpty()) {
                    treeNode(r, "🤖", "AI Review", 0, "AI analysis completed — no additional findings");
                }
                // Also parse aiExplanation/aiRiskSummary if present in response for later use
            } else if (resp.statusCode() == 503) {
                treeNode(r, "🤖", "AI Review", 0, "AI service not configured (GOOGLE_AI_API_KEY not set)");
            } else {
                treeNode(r, "🤖", "AI Review", 0, "AI service returned HTTP " + resp.statusCode());
            }
        } catch (java.io.IOException | InterruptedException e) {
            throw new RuntimeException("Agent service unreachable: " + e.getMessage(), e);
        }
    }

    private static String escJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    /**
     * Update PR status: review (REVIEWING), approve (APPROVED), reject (REJECTED).
     * Writes back to HDFS repo/.pr/PR-xxx.json.
     */
    public boolean updatePullRequestReview(String username, String repoName, String prId, String reviewer) {
        return updatePrStatus(username, repoName, prId, "REVIEWING", "reviewedBy", reviewer, true, false);
    }

    public boolean updatePullRequestApprove(String username, String repoName, String prId, String approver) {
        return updatePrStatus(username, repoName, prId, "APPROVED", "approvedBy", approver, false, true);
    }

    public boolean updatePullRequestReject(String username, String repoName, String prId, String rejector) {
        return updatePrStatus(username, repoName, prId, "REJECTED", "rejectedBy", rejector, false, true);
    }

    /**
     * Merge PR (fast-forward only). Updates target branch to source commit and sets PR status to MERGED.
     * Requires PR to be APPROVED and have no conflicts.
     */
    public String mergePullRequest(String username, String repoName, String prId, String mergedBy) {
        PrDto pr = getPullRequest(username, repoName, prId);
        if (pr == null) return "PR not found";
        if (!"APPROVED".equals(pr.getStatus())) return "PR must be approved first";
        if (pr.isHasConflicts()) return "Cannot merge: conflicts must be resolved first";

        String sourceCommit = getCommitHashForBranch(username, repoName, pr.getSourceBranch());
        String targetCommit = getCommitHashForBranch(username, repoName, pr.getTargetBranch());
        if (sourceCommit == null || targetCommit == null) return "Branch refs not found";

        sourceCommit = resolveToFullHash(username, repoName, sourceCommit);
        targetCommit = resolveToFullHash(username, repoName, targetCommit);
        if (sourceCommit == null) sourceCommit = getCommitHashForBranch(username, repoName, pr.getSourceBranch());
        if (targetCommit == null) targetCommit = getCommitHashForBranch(username, repoName, pr.getTargetBranch());

        try {
            if (isAncestor(username, repoName, targetCommit, sourceCommit)) {
                // Fast-forward: point target branch to source commit
                Path refPath = new Path(basePath + "/" + username + "/" + repoName + "/refs/heads/" + pr.getTargetBranch());
                try (org.apache.hadoop.fs.FSDataOutputStream out = fileSystem.create(refPath, true)) {
                    out.write((sourceCommit + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
            } else {
                // Non-fast-forward: create merge commit with two parents
                String targetTree = getTreeHashFromCommit(username, repoName, targetCommit);
                String sourceTree = getTreeHashFromCommit(username, repoName, sourceCommit);
                if (targetTree == null || sourceTree == null) return "Could not read tree from commits";

                Map<String, String> targetBlobs = new HashMap<>();
                collectBlobsFromTree(username, repoName, targetTree, "", targetBlobs);
                Map<String, String> sourceBlobs = new HashMap<>();
                collectBlobsFromTree(username, repoName, sourceTree, "", sourceBlobs);

                // 3-way merge using common ancestor to avoid false conflict on files only one branch touched
                String ancestorCommit = findCommonAncestor(username, repoName, targetCommit, sourceCommit);
                Map<String, String> ancestorBlobs = new HashMap<>();
                if (ancestorCommit != null) {
                    String ancestorTree = getTreeHashFromCommit(username, repoName, ancestorCommit);
                    if (ancestorTree != null) {
                        collectBlobsFromTree(username, repoName, ancestorTree, "", ancestorBlobs);
                    }
                }
                Map<String, String> mergedBlobs = mergeThreeWayBlobMaps(targetBlobs, sourceBlobs, ancestorBlobs);
                if (mergedBlobs == null) return "Cannot merge: this PR has unresolved conflicts. Resolve them locally and update your branch before merging.";

                String mergeTreeHash = writeTreeFromBlobMap(username, repoName, mergedBlobs, "");
                if (mergeTreeHash == null) return "Failed to create merge tree";

                String author = (mergedBy != null && !mergedBy.isBlank())
                        ? mergedBy.trim()
                        : getAuthorFromCommit(username, repoName, sourceCommit);
                if (author == null || author.isEmpty()) author = "VEGA UI";
                String mergeMessage = "Merge branch '" + pr.getSourceBranch() + "' into " + pr.getTargetBranch();
                long timestamp = System.currentTimeMillis() / 1000;

                String mergeCommitHash = writeCommitObject(username, repoName, mergeTreeHash,
                        Arrays.asList(targetCommit, sourceCommit), author, timestamp, mergeMessage);
                if (mergeCommitHash == null) return "Failed to create merge commit";

                Path refPath = new Path(basePath + "/" + username + "/" + repoName + "/refs/heads/" + pr.getTargetBranch());
                try (org.apache.hadoop.fs.FSDataOutputStream out = fileSystem.create(refPath, true)) {
                    out.write((mergeCommitHash + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
            }
            updatePrStatusToMerged(username, repoName, prId, mergedBy);
            return null;
        } catch (Exception e) {
            log.error("Failed to merge PR {}: {}", prId, e.getMessage());
            return "Merge failed: " + e.getMessage();
        }
    }

    /**
     * 3-way merge of path→blob maps using common ancestor.
     * A true conflict only exists when BOTH branches independently changed the same file differently.
     * Returns null only for true conflicts; auto-resolves single-side changes.
     */
    private Map<String, String> mergeThreeWayBlobMaps(
            Map<String, String> target, Map<String, String> source, Map<String, String> ancestor) {
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(target.keySet());
        allPaths.addAll(source.keySet());
        if (ancestor != null) allPaths.addAll(ancestor.keySet());
        Map<String, String> merged = new HashMap<>();
        for (String path : allPaths) {
            String t = target.get(path);
            String s = source.get(path);
            String a = ancestor != null ? ancestor.get(path) : null;
            boolean sourceChanged = !Objects.equals(s, a);
            boolean targetChanged = !Objects.equals(t, a);
            if (!sourceChanged && !targetChanged) {
                // Neither branch changed this file — keep current
                if (t != null) merged.put(path, t);
            } else if (sourceChanged && !targetChanged) {
                // Only source changed — accept source (null = deleted by source)
                if (s != null) merged.put(path, s);
            } else if (!sourceChanged && targetChanged) {
                // Only target changed — accept target (null = deleted by target)
                if (t != null) merged.put(path, t);
            } else {
                // Both changed
                if (Objects.equals(s, t)) {
                    // Identical outcome in both branches — accept either
                    if (t != null) merged.put(path, t);
                } else {
                    // True conflict: both branches changed the same file differently
                    return null;
                }
            }
        }
        return merged;
    }

    /** Merge two path->blob maps. Returns null if conflict (same path, different hash). */
    private Map<String, String> mergeBlobMaps(Map<String, String> target, Map<String, String> source) {
        Set<String> allPaths = new HashSet<>();
        allPaths.addAll(target.keySet());
        allPaths.addAll(source.keySet());
        Map<String, String> merged = new HashMap<>();
        for (String path : allPaths) {
            String t = target.get(path);
            String s = source.get(path);
            if (t == null) merged.put(path, s);
            else if (s == null) merged.put(path, t);
            else if (t.equals(s)) merged.put(path, t);
            else return null; // conflict
        }
        return merged;
    }

    /** Build tree object(s) from flat path->blob map and write to HDFS. Returns root tree hash. */
    private String writeTreeFromBlobMap(String username, String repoName, Map<String, String> blobMap, String prefix) {
        try {
            String dirPrefix = prefix.isEmpty() ? "" : prefix + "/";
            Map<String, String> entries = new TreeMap<>(); // first segment -> hash (blob or tree)
            for (Map.Entry<String, String> e : blobMap.entrySet()) {
                String path = e.getKey();
                if (!path.startsWith(dirPrefix) && !(prefix.isEmpty() && !path.contains("/"))) continue;
                String rel = prefix.isEmpty() ? path : path.substring(dirPrefix.length());
                if (rel.isEmpty()) continue;
                int slash = rel.indexOf('/');
                String first = slash < 0 ? rel : rel.substring(0, slash);
                if (entries.containsKey(first)) continue; // already added
                if (slash < 0) {
                    entries.put(first, e.getValue());
                } else {
                    String subPrefix = prefix.isEmpty() ? first : prefix + "/" + first;
                    Map<String, String> sub = new HashMap<>();
                    for (Map.Entry<String, String> entry : blobMap.entrySet()) {
                        String p = entry.getKey();
                        if (p.startsWith(subPrefix + "/")) sub.put(p, entry.getValue());
                    }
                    String subHash = writeTreeFromBlobMap(username, repoName, sub, subPrefix);
                    if (subHash == null) return null;
                    entries.put(first, subHash);
                }
            }
            List<String> lines = new ArrayList<>();
            for (Map.Entry<String, String> e : entries.entrySet()) {
                String name = e.getKey();
                String hash = e.getValue();
                String subPrefix = prefix.isEmpty() ? name : prefix + "/" + name;
                boolean hasSubPath = blobMap.keySet().stream().anyMatch(p -> p.startsWith(subPrefix + "/"));
                if (hasSubPath) lines.add("tree " + hash + " " + name);
                else lines.add("blob " + hash + " " + name);
            }
            Collections.sort(lines);
            StringBuilder content = new StringBuilder();
            for (String line : lines) content.append(line).append("\n");
            byte[] contentBytes = content.toString().getBytes(StandardCharsets.UTF_8);
            String header = "tree " + contentBytes.length + "\0";
            byte[] full = new byte[header.getBytes(StandardCharsets.UTF_8).length + contentBytes.length];
            System.arraycopy(header.getBytes(StandardCharsets.UTF_8), 0, full, 0, header.getBytes(StandardCharsets.UTF_8).length);
            System.arraycopy(contentBytes, 0, full, header.getBytes(StandardCharsets.UTF_8).length, contentBytes.length);
            String treeHash = sha1Hex(full);
            Path objPath = objectPath(username, repoName, treeHash);
            if (objPath != null && !fileSystem.exists(objPath)) {
                Path parent = objPath.getParent();
                if (parent != null) fileSystem.mkdirs(parent);
                try (FSDataOutputStream out = fileSystem.create(objPath, true)) {
                    out.write(full);
                }
            }
            return treeHash;
        } catch (Exception e) {
            log.error("writeTreeFromBlobMap failed: {}", e.getMessage());
            return null;
        }
    }

    private String sha1Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(data);
            StringBuilder sb = new StringBuilder(40);
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    private String getAuthorFromCommit(String username, String repoName, String commitHash) {
        String content = readCommitObject(username, repoName, commitHash);
        if (content == null) return null;
        Pattern authorPattern = Pattern.compile("author\\s+(.+?)\\s+\\d+", Pattern.MULTILINE);
        Matcher m = authorPattern.matcher(content);
        return m.find() ? m.group(1).trim() : null;
    }

    private String writeCommitObject(String username, String repoName, String treeHash, List<String> parentHashes,
                                     String author, long timestamp, String message) {
        try {
            StringBuilder content = new StringBuilder();
            content.append("tree ").append(treeHash).append("\n");
            for (String p : parentHashes) content.append("parent ").append(p).append("\n");
            content.append("author ").append(author).append(" ").append(timestamp).append("\n\n");
            content.append(message).append("\n");
            byte[] contentBytes = content.toString().getBytes(StandardCharsets.UTF_8);
            String header = "commit " + contentBytes.length + "\0";
            byte[] full = new byte[header.getBytes(StandardCharsets.UTF_8).length + contentBytes.length];
            System.arraycopy(header.getBytes(StandardCharsets.UTF_8), 0, full, 0, header.getBytes(StandardCharsets.UTF_8).length);
            System.arraycopy(contentBytes, 0, full, header.getBytes(StandardCharsets.UTF_8).length, contentBytes.length);
            String commitHash = sha1Hex(full);
            Path objPath = objectPath(username, repoName, commitHash);
            if (objPath != null && !fileSystem.exists(objPath)) {
                Path parent = objPath.getParent();
                if (parent != null) fileSystem.mkdirs(parent);
                try (FSDataOutputStream out = fileSystem.create(objPath, true)) {
                    out.write(full);
                }
            }
            return commitHash;
        } catch (Exception e) {
            log.error("writeCommitObject failed: {}", e.getMessage());
            return null;
        }
    }

    private boolean isAncestor(String username, String repoName, String ancestor, String descendant) {
        Set<String> visited = new HashSet<>();
        java.util.Deque<String> queue = new java.util.ArrayDeque<>();
        queue.add(descendant);
        while (!queue.isEmpty()) {
            String c = queue.poll();
            if (c == null || visited.contains(c)) continue;
            visited.add(c);
            if (c.equals(ancestor)) return true;
            String parent = getParentHashFromCommit(username, repoName, c);
            if (parent != null) queue.add(parent);
        }
        return false;
    }

    private void updatePrStatusToMerged(String username, String repoName, String prId, String mergedBy) {
        String normId = prId.toUpperCase().startsWith("PR-") ? prId : "PR-" + prId;
        Path prPath = new Path(basePath + "/" + username + "/" + repoName + "/.pr/" + normId + ".json");
        try {
            if (!fileSystem.exists(prPath)) return;
            String content = readFileContent(prPath);
            if (content == null) return;
            ObjectNode root = (ObjectNode) PR_MAPPER.readTree(content);
            root.put("status", "MERGED");
            if (mergedBy != null) root.put("mergedBy", mergedBy);
            root.put("reviewCompletedAt", System.currentTimeMillis());
            byte[] bytes = PR_MAPPER.writeValueAsBytes(root);
            try (org.apache.hadoop.fs.FSDataOutputStream out = fileSystem.create(prPath, true)) {
                out.write(bytes);
            }
        } catch (Exception e) {
            log.error("Failed to update PR {} to MERGED: {}", prId, e.getMessage());
        }
    }

    private boolean updatePrStatus(String username, String repoName, String prId,
                                   String newStatus, String actorFieldName, String actorUsername,
                                   boolean setReviewStarted, boolean setReviewCompleted) {
        String normId = prId.toUpperCase().startsWith("PR-") ? prId : "PR-" + prId;
        Path prPath = new Path(basePath + "/" + username + "/" + repoName + "/.pr/" + normId + ".json");
        try {
            if (!fileSystem.exists(prPath)) return false;
            String content = readFileContent(prPath);
            if (content == null) return false;
            ObjectNode root = (ObjectNode) PR_MAPPER.readTree(content);
            // Service-level self-action guard: non-owners cannot approve/review/reject their own PR
            String prAuthor = root.has("author") ? root.get("author").asText(null) : null;
            if (actorUsername != null && actorUsername.equals(prAuthor) && !actorUsername.equals(username)) return false;
            String current = root.has("status") ? root.get("status").asText() : "OPEN";
            if ("MERGED".equals(current) || "REJECTED".equals(current)) return false;
            if ("APPROVED".equals(newStatus) && !"OPEN".equals(current) && !"REVIEWING".equals(current)) return false;
            root.put("status", newStatus);
            if (actorFieldName != null && actorUsername != null) root.put(actorFieldName, actorUsername);
            long now = System.currentTimeMillis();
            if (setReviewStarted) root.put("reviewStartedAt", now);
            if (setReviewCompleted) root.put("reviewCompletedAt", now);
            byte[] bytes = PR_MAPPER.writeValueAsBytes(root);
            try (org.apache.hadoop.fs.FSDataOutputStream out = fileSystem.create(prPath, true)) {
                out.write(bytes);
            }
            return true;
        } catch (Exception e) {
            log.error("Failed to update PR {} in {}/{}: {}", prId, username, repoName, e.getMessage());
            return false;
        }
    }

    /** Decompress if GZIP (push service stores compressed). */
    private byte[] maybeDecompress(byte[] data) {
        if (data == null || data.length < 2) return data;
        if (data[0] != (byte) 0x1f || data[1] != (byte) 0x8b) return data;
        try {
            try (GZIPInputStream gz = new GZIPInputStream(new ByteArrayInputStream(data));
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = gz.read(buf)) != -1) out.write(buf, 0, n);
                return out.toByteArray();
            }
        } catch (Exception e) {
            log.debug("Decompression failed, using raw: {}", e.getMessage());
            return data;
        }
    }
}
