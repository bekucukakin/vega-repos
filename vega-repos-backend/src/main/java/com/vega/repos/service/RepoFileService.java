package com.vega.repos.service;

import com.vega.repos.dto.FileContentDto;
import com.vega.repos.dto.FileTreeNodeDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class RepoFileService {

    private static final Logger log = LoggerFactory.getLogger(RepoFileService.class);
    private static final Set<String> TEXT_EXTENSIONS = Set.of(
            "java", "kt", "py", "js", "jsx", "ts", "tsx", "css", "scss", "html", "htm", "xml", "json",
            "yml", "yaml", "md", "txt", "sql", "sh", "bat", "gradle", "properties", "ini", "env"
    );

    private final RepoService repoService;

    public RepoFileService(RepoService repoService) {
        this.repoService = repoService;
    }

    public List<FileTreeNodeDto> getFileTree(String username, String repoName, String branch) {
        return repoService.getFileTree(username, repoName, branch != null ? branch : "master");
    }

    public FileContentDto getFileContent(String username, String repoName, String branch, String filePath) {
        return repoService.getFileContent(username, repoName, branch != null ? branch : "master", filePath);
    }

    public static boolean isTextFile(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0) return true;
        String ext = path.substring(dot + 1).toLowerCase();
        return TEXT_EXTENSIONS.contains(ext);
    }
}
