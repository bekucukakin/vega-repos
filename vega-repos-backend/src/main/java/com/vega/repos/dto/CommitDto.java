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
public class CommitDto {

    /** Short hash for display (12 chars) */
    private String hash;
    /** Full 40-char hash for API calls (diff, etc.) */
    private String fullHash;
    private String message;
    private String author;
    private Long timestamp;
    private Boolean aiGenerated;
    /** Parent commit full hash (null for root commits) */
    private String parentHash;
    /** Branch names that point to this commit (tip commits) */
    private List<String> branches;
}
