package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommitDiffDto {
    private String commitHash;
    private String message;
    private String author;
    private Long timestamp;
    /** Changed files: path, status (added|modified|deleted), unifiedDiff for modified */
    private List<FileDiffDto> files;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FileDiffDto {
        private String path;
        private String status; // added, modified, deleted
        private String unifiedDiff; // optional, for modified files
    }
}
