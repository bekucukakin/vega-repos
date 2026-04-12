package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BranchDto {

    private String name;
    /** Tip commit full hash from refs/heads */
    private String commitHash;
    /** Last commit on this branch (for list UI) */
    private String tipMessage;
    private String tipAuthor;
    private Long tipTimestamp;
    /** Short hash for display (e.g. 12 chars), same style as CommitDto.hash */
    private String tipShortHash;
}
