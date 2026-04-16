package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommitInsightDto {
    private Long id;
    private String commitHash;
    private String question;
    private String answer;
    private String askedBy;
    private int likes;
    private Instant createdAt;
}
