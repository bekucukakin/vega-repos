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

        try {
            if (!fileSystem.exists(refsHeadsPath)) {
                return branches;
            }
            collectBranchRefs(refsHeadsPath, refsHeadsPath, branches);
        } catch (Exception e) {
            log.error("Failed to list branches for {}/{}", username, repoName, e);
            throw new RuntimeException("Failed to list branches: " + e.getMessage());
        }
        return branches;
    }

    private void collectBranchRefs(Path refsRoot, Path current, List<BranchDto> branches) throws Exception {
        FileStatus[] statuses = fileSystem.listStatus(current);
        String rootUri = refsRoot.toUri().getPath();
        for (FileStatus status : statuses) {
            if (status.isFile()) {
                String fileUri = status.getPath().toUri().getPath();
                String branchName = fileUri.substring(rootUri.length() + 1);
                String commitHash = readFileContent(status.getPath());
                if (commitHash != null) commitHash = commitHash.trim();
                branches.add(BranchDto.builder().name(branchName).commitHash(commitHash).build());
            } else if (status.isDirectory()) {
                collectBranchRefs(refsRoot, status.getPath(), branches);
            }
        }
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
        String current = commitHash;
        while (current != null && !visited.contains(current) && visited.size() < limit) {
            visited.add(current);
            current = getParentHashFromCommit(username, repoName, current);
        }
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
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("added").build());
            } else if (parentBlob != null && currentBlob == null) {
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("deleted").build());
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
        StringBuilder sb = new StringBuilder();
        for (String line : oldStr.split("\n", -1)) {
            sb.append("-").append(line).append("\n");
        }
        for (String line : newStr.split("\n", -1)) {
            sb.append("+").append(line).append("\n");
        }
        return sb.length() > 10000 ? sb.substring(0, 10000) + "\n... (truncated)" : sb.toString();
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
            String shortHash = hash.length() > 2 ? hash.substring(0, 2) : hash;
            String restHash = hash.length() > 2 ? hash.substring(2) : "";
            Path objectPath = new Path(repoPathStr + "/" + shortHash + "/" + restHash);

            if (!fileSystem.exists(objectPath)) {
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

        for (String line : content.split("\\r?\\n")) {
            if (line.startsWith("parent ")) {
                parentHash = line.substring(7).trim();
            }
        }

        Pattern authorPattern = Pattern.compile("author\\s+(.+?)\\s+(\\d+)(?:\\s|$)", Pattern.MULTILINE);
        Matcher authorMatcher = authorPattern.matcher(content);
        if (authorMatcher.find()) {
            String authorPart = authorMatcher.group(1).trim();
            int emailStart = authorPart.indexOf(" <");
            author = emailStart > 0 ? authorPart.substring(0, emailStart) : authorPart;
            try {
                timestamp = Long.parseLong(authorMatcher.group(2)) * 1000;
            } catch (NumberFormatException ignored) {}
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
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("added").build());
            } else if (targetBlob != null && sourceBlob == null) {
                files.add(CommitDiffDto.FileDiffDto.builder().path(path).status("deleted").build());
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
     * List PRs from HDFS repo/.pr/ (PR-001.json, PR-002.json ...).
     * PR metadata is stored when vega pr create/approve/merge runs (sync via push).
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
                        List<String> riskReasons = new ArrayList<>();
                        if (n.has("riskReasons") && n.get("riskReasons").isArray()) {
                            n.get("riskReasons").forEach(r -> riskReasons.add(r.asText()));
                        }
                        List<String> conflictedFiles = new ArrayList<>();
                        if (n.has("conflictedFiles") && n.get("conflictedFiles").isArray()) {
                            n.get("conflictedFiles").forEach(c -> conflictedFiles.add(c.asText()));
                        }
                        List<String> riskRecommendations = new ArrayList<>();
                        if (n.has("riskRecommendations") && n.get("riskRecommendations").isArray()) {
                            n.get("riskRecommendations").forEach(r -> riskRecommendations.add(r.asText()));
                        }
                        PrDto dto = PrDto.builder()
                                .id(n.has("id") ? n.get("id").asText() : status.getPath().getName().replace(".json", ""))
                                .sourceBranch(n.has("sourceBranch") ? n.get("sourceBranch").asText() : "")
                                .targetBranch(n.has("targetBranch") ? n.get("targetBranch").asText() : "")
                                .author(n.has("author") ? n.get("author").asText() : "")
                                .status(n.has("status") ? n.get("status").asText() : "OPEN")
                                .createdTimestamp(n.has("createdTimestamp") ? n.get("createdTimestamp").asLong() : 0)
                                .diffSummary(n.has("diffSummary") ? n.get("diffSummary").asText() : "")
                                .hasConflicts(n.has("hasConflicts") && n.get("hasConflicts").asBoolean())
                                .summaryFilesChanged(n.has("summaryFilesChanged") ? n.get("summaryFilesChanged").asInt() : null)
                                .summaryLinesAdded(n.has("summaryLinesAdded") ? n.get("summaryLinesAdded").asInt() : null)
                                .summaryLinesRemoved(n.has("summaryLinesRemoved") ? n.get("summaryLinesRemoved").asInt() : null)
                                .riskLevel(n.has("riskLevel") ? n.get("riskLevel").asText() : null)
                                .riskReasons(riskReasons.isEmpty() ? null : riskReasons)
                                .riskRecommendations(riskRecommendations.isEmpty() ? null : riskRecommendations)
                                .conflictedFiles(conflictedFiles.isEmpty() ? null : conflictedFiles)
                                .build();
                        prs.add(dto);
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

    private static final ObjectMapper PR_MAPPER = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    /**
     * Update PR status: review (REVIEWING), approve (APPROVED), reject (REJECTED).
     * Writes back to HDFS repo/.pr/PR-xxx.json.
     */
    public boolean updatePullRequestReview(String username, String repoName, String prId, String reviewer) {
        return updatePrStatus(username, repoName, prId, "REVIEWING", reviewer, true, false);
    }

    public boolean updatePullRequestApprove(String username, String repoName, String prId, String approver) {
        return updatePrStatus(username, repoName, prId, "APPROVED", approver, false, true);
    }

    public boolean updatePullRequestReject(String username, String repoName, String prId, String rejector) {
        return updatePrStatus(username, repoName, prId, "REJECTED", null, false, true);
    }

    /**
     * Merge PR (fast-forward only). Updates target branch to source commit and sets PR status to MERGED.
     * Requires PR to be APPROVED and have no conflicts.
     */
    public String mergePullRequest(String username, String repoName, String prId) {
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

                Map<String, String> mergedBlobs = mergeBlobMaps(targetBlobs, sourceBlobs);
                if (mergedBlobs == null) return "Merge conflict: same file modified in both branches. Resolve via VEGA CLI.";

                String mergeTreeHash = writeTreeFromBlobMap(username, repoName, mergedBlobs, "");
                if (mergeTreeHash == null) return "Failed to create merge tree";

                String author = getAuthorFromCommit(username, repoName, sourceCommit);
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
            updatePrStatusToMerged(username, repoName, prId);
            return null;
        } catch (Exception e) {
            log.error("Failed to merge PR {}: {}", prId, e.getMessage());
            return "Merge failed: " + e.getMessage();
        }
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

    private void updatePrStatusToMerged(String username, String repoName, String prId) {
        String normId = prId.toUpperCase().startsWith("PR-") ? prId : "PR-" + prId;
        Path prPath = new Path(basePath + "/" + username + "/" + repoName + "/.pr/" + normId + ".json");
        try {
            if (!fileSystem.exists(prPath)) return;
            String content = readFileContent(prPath);
            if (content == null) return;
            ObjectNode root = (ObjectNode) PR_MAPPER.readTree(content);
            root.put("status", "MERGED");
            byte[] bytes = PR_MAPPER.writeValueAsBytes(root);
            try (org.apache.hadoop.fs.FSDataOutputStream out = fileSystem.create(prPath, true)) {
                out.write(bytes);
            }
        } catch (Exception e) {
            log.error("Failed to update PR {} to MERGED: {}", prId, e.getMessage());
        }
    }

    private boolean updatePrStatus(String username, String repoName, String prId,
                                   String newStatus, String approvedBy, boolean setReviewStarted, boolean setReviewCompleted) {
        String normId = prId.toUpperCase().startsWith("PR-") ? prId : "PR-" + prId;
        Path prPath = new Path(basePath + "/" + username + "/" + repoName + "/.pr/" + normId + ".json");
        try {
            if (!fileSystem.exists(prPath)) return false;
            String content = readFileContent(prPath);
            if (content == null) return false;
            ObjectNode root = (ObjectNode) PR_MAPPER.readTree(content);
            String current = root.has("status") ? root.get("status").asText() : "OPEN";
            if ("MERGED".equals(current) || "REJECTED".equals(current)) return false;
            if ("APPROVED".equals(newStatus) && !"OPEN".equals(current) && !"REVIEWING".equals(current)) return false;
            root.put("status", newStatus);
            if (approvedBy != null) root.put("approvedBy", approvedBy);
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
