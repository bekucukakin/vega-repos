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
public class RepoInsightsDto {

    private long totalCommits;
    private long totalPRs;
    private long openPRs;
    private long mergedPRs;
    private long rejectedPRs;
    private long totalBranches;
    private double aiAdoptionRate;
    private long avgPrReviewTimeMs;

    private List<WeeklyActivity> commitActivity;
    private List<ContributorStat> contributors;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WeeklyActivity {
        private long weekStart;
        private int commitCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContributorStat {
        private String author;
        private int commitCount;
        private int aiCommitCount;
    }
}
