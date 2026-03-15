package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommitMetricsDto {
    private long totalCommits;
    private long aiGeneratedCount;
    private long manualCount;
    private double aiAdoptionRatePercent;
    private long totalGenerated;
    private long acceptedFirst;
    private long acceptedAfterRegenerate;
    private long rejected;
    private long totalRegenerations;
    private long accepted;
    private double acceptRatePercent;
    private double firstTryAcceptRatePercent;
    private double avgRegenerationsWhenRegenerated;
    private long avgTimeToAcceptMs;
}
