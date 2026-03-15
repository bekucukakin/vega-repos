package com.vega.repos.service;

import com.vega.repos.dto.CommitMetricsDto;
import com.vega.repos.dto.CommitDto;
import com.vega.repos.dto.PrDto;
import com.vega.repos.dto.PrMetricsDto;
import com.vega.repos.dto.RepoDto;
import com.vega.repos.dto.VegaMetricsDto;
import com.vega.repos.entity.UserCommitMetrics;
import com.vega.repos.entity.UserPrMetrics;
import com.vega.repos.repository.UserCommitMetricsRepository;
import com.vega.repos.repository.UserPrMetricsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Computes per-user and global VEGA metrics.
 * Combines live HDFS repository data (commits, PRs) with DB-stored metrics (CLI sync, approve/reject).
 */
@Service
public class MetricsService {

    private static final Logger log = LoggerFactory.getLogger(MetricsService.class);

    private final UserCommitMetricsRepository commitMetricsRepo;
    private final UserPrMetricsRepository prMetricsRepo;
    private final RepoService repoService;

    public MetricsService(UserCommitMetricsRepository commitMetricsRepo,
                          UserPrMetricsRepository prMetricsRepo,
                          RepoService repoService) {
        this.commitMetricsRepo = commitMetricsRepo;
        this.prMetricsRepo = prMetricsRepo;
        this.repoService = repoService;
    }

    /** Get metrics for a specific user — computed live from HDFS repos + DB data. */
    public VegaMetricsDto getMetricsForUser(String username) {
        CommitMetricsDto commit = computeCommitMetrics(username);
        PrMetricsDto pr = computePrMetrics(username);
        return VegaMetricsDto.builder()
                .scope("user")
                .username(username)
                .commitMetrics(commit)
                .prMetrics(pr)
                .build();
    }

    /** Get global VEGA metrics (aggregated across all users from DB + HDFS). */
    public VegaMetricsDto getGlobalMetrics() {
        List<String> allUsers = repoService.listAllUsernames();
        long totalCommits = 0, aiCount = 0;
        long totalPrs = 0, openC = 0, reviewingC = 0, approvedC = 0, rejectedC = 0, mergedC = 0, riskC = 0;

        for (String user : allUsers) {
            try {
                List<RepoDto> repos = repoService.listRepositories(user);
                for (RepoDto repo : repos) {
                    List<CommitDto> commits = repoService.getCommits(user, repo.getName(), 500);
                    totalCommits += commits.size();
                    aiCount += commits.stream().filter(c -> Boolean.TRUE.equals(c.getAiGenerated())).count();

                    List<PrDto> prs = repoService.getPullRequests(user, repo.getName());
                    totalPrs += prs.size();
                    for (PrDto pr : prs) {
                        switch (pr.getStatus() != null ? pr.getStatus() : "") {
                            case "OPEN" -> openC++;
                            case "REVIEWING" -> reviewingC++;
                            case "APPROVED" -> approvedC++;
                            case "REJECTED" -> rejectedC++;
                            case "MERGED" -> mergedC++;
                        }
                        if (pr.getRiskLevel() != null && !pr.getRiskLevel().isBlank()) riskC++;
                    }
                }
            } catch (Exception e) {
                log.debug("Failed to compute metrics for user {}: {}", user, e.getMessage());
            }
        }

        long manualCount = totalCommits - aiCount;
        double aiRate = totalCommits > 0 ? (100.0 * aiCount / totalCommits) : 0;

        CommitMetricsDto commitDto = aggregateDbCommitMetrics();
        commitDto.setTotalCommits(totalCommits);
        commitDto.setAiGeneratedCount(aiCount);
        commitDto.setManualCount(manualCount);
        commitDto.setAiAdoptionRatePercent(aiRate);

        PrMetricsDto prDto = aggregateDbPrMetrics();
        prDto.setTotalPrs(totalPrs);
        prDto.setOpenCount(openC);
        prDto.setReviewingCount(reviewingC);
        prDto.setApprovedCount(prDto.getApprovedCount() + approvedC);
        prDto.setRejectedCount(prDto.getRejectedCount() + rejectedC);
        prDto.setMergedCount(mergedC);
        prDto.setWithRiskAnalysisCount(riskC);

        return VegaMetricsDto.builder()
                .scope("global")
                .username(null)
                .commitMetrics(commitDto)
                .prMetrics(prDto)
                .build();
    }

    /** Compute commit metrics for a user from HDFS repos + DB. */
    private CommitMetricsDto computeCommitMetrics(String username) {
        long totalCommits = 0;
        long aiCount = 0;

        try {
            List<RepoDto> repos = repoService.listRepositories(username);
            for (RepoDto repo : repos) {
                List<CommitDto> commits = repoService.getCommits(username, repo.getName(), 500);
                totalCommits += commits.size();
                aiCount += commits.stream().filter(c -> Boolean.TRUE.equals(c.getAiGenerated())).count();
            }
        } catch (Exception e) {
            log.debug("Failed to scan repos for commit metrics: {}", e.getMessage());
        }

        long manualCount = totalCommits - aiCount;
        double aiRate = totalCommits > 0 ? (100.0 * aiCount / totalCommits) : 0;

        CommitMetricsDto dto = commitMetricsRepo.findByUsernameIgnoreCase(username)
                .map(this::toCommitDto)
                .orElse(emptyCommitMetrics());

        dto.setTotalCommits(totalCommits);
        dto.setAiGeneratedCount(aiCount);
        dto.setManualCount(manualCount);
        dto.setAiAdoptionRatePercent(aiRate);
        return dto;
    }

    /** Compute PR metrics for a user from HDFS repos + DB. */
    private PrMetricsDto computePrMetrics(String username) {
        long totalPrs = 0, openC = 0, reviewingC = 0, approvedC = 0, rejectedC = 0, mergedC = 0, riskC = 0;

        try {
            List<RepoDto> repos = repoService.listRepositories(username);
            for (RepoDto repo : repos) {
                List<PrDto> prs = repoService.getPullRequests(username, repo.getName());
                totalPrs += prs.size();
                for (PrDto pr : prs) {
                    switch (pr.getStatus() != null ? pr.getStatus() : "") {
                        case "OPEN" -> openC++;
                        case "REVIEWING" -> reviewingC++;
                        case "APPROVED" -> approvedC++;
                        case "REJECTED" -> rejectedC++;
                        case "MERGED" -> mergedC++;
                    }
                    if (pr.getRiskLevel() != null && !pr.getRiskLevel().isBlank()) riskC++;
                }
            }
        } catch (Exception e) {
            log.debug("Failed to scan repos for PR metrics: {}", e.getMessage());
        }

        PrMetricsDto dto = prMetricsRepo.findByUsernameIgnoreCase(username)
                .map(this::toPrDto)
                .orElse(emptyPrMetrics());

        dto.setTotalPrs(totalPrs);
        dto.setOpenCount(openC);
        dto.setReviewingCount(reviewingC);
        dto.setApprovedCount(dto.getApprovedCount() + approvedC);
        dto.setRejectedCount(dto.getRejectedCount() + rejectedC);
        dto.setMergedCount(mergedC);
        dto.setWithRiskAnalysisCount(riskC);
        return dto;
    }

    private CommitMetricsDto toCommitDto(UserCommitMetrics e) {
        long accepted = (e.getAcceptedFirst() != null ? e.getAcceptedFirst() : 0)
                + (e.getAcceptedAfterRegenerate() != null ? e.getAcceptedAfterRegenerate() : 0);
        long totalResponses = accepted + (e.getRejected() != null ? e.getRejected() : 0);
        double acceptRate = totalResponses > 0 ? (100.0 * accepted / totalResponses) : 0;
        long totalGen = e.getTotalGenerated() != null ? e.getTotalGenerated() : 0;
        double firstTryRate = totalGen > 0 ? (100.0 * (e.getAcceptedFirst() != null ? e.getAcceptedFirst() : 0) / totalGen) : 0;
        long acr = e.getAcceptedAfterRegenerate() != null ? e.getAcceptedAfterRegenerate() : 0;
        long totalReg = e.getTotalRegenerations() != null ? e.getTotalRegenerations() : 0;
        double avgRegens = acr > 0 ? (double) totalReg / acr : 0;
        long timeMs = e.getTotalTimeToAcceptMs() != null ? e.getTotalTimeToAcceptMs() : 0;
        long avgTime = accepted > 0 ? timeMs / accepted : 0;

        return CommitMetricsDto.builder()
                .totalGenerated(totalGen)
                .acceptedFirst(e.getAcceptedFirst() != null ? e.getAcceptedFirst() : 0)
                .acceptedAfterRegenerate(acr)
                .rejected(e.getRejected() != null ? e.getRejected() : 0)
                .totalRegenerations(totalReg)
                .accepted(accepted)
                .acceptRatePercent(acceptRate)
                .firstTryAcceptRatePercent(firstTryRate)
                .avgRegenerationsWhenRegenerated(avgRegens)
                .avgTimeToAcceptMs(avgTime)
                .build();
    }

    private PrMetricsDto toPrDto(UserPrMetrics e) {
        long total = e.getTotalPrsAnalyzed() != null ? e.getTotalPrsAnalyzed() : 0;
        long withF = e.getPrsWithFeatureCount() != null ? e.getPrsWithFeatureCount() : 0;
        long withoutF = e.getPrsWithoutFeatureCount() != null ? e.getPrsWithoutFeatureCount() : 0;
        long timeWith = e.getTotalReviewTimeWithFeatureMs() != null ? e.getTotalReviewTimeWithFeatureMs() : 0;
        long timeWithout = e.getTotalReviewTimeWithoutFeatureMs() != null ? e.getTotalReviewTimeWithoutFeatureMs() : 0;
        long avgWith = withF > 0 ? timeWith / withF : 0;
        long avgWithout = withoutF > 0 ? timeWithout / withoutF : 0;
        double improve = avgWithout > 0 ? ((double) (avgWithout - avgWith) / avgWithout) * 100 : 0;

        return PrMetricsDto.builder()
                .totalPrsAnalyzed(total)
                .prsWithFeatureCount(withF)
                .prsWithoutFeatureCount(withoutF)
                .approvedCount(e.getApprovedCount() != null ? e.getApprovedCount() : 0)
                .rejectedCount(e.getRejectedCount() != null ? e.getRejectedCount() : 0)
                .totalReviewTimeWithFeatureMs(timeWith)
                .totalReviewTimeWithoutFeatureMs(timeWithout)
                .avgReviewTimeWithFeatureMs(avgWith)
                .avgReviewTimeWithoutFeatureMs(avgWithout)
                .reviewTimeImprovementPercent(improve)
                .build();
    }

    private CommitMetricsDto aggregateDbCommitMetrics() {
        List<UserCommitMetrics> list = commitMetricsRepo.findAll();
        long tg = 0, af = 0, aar = 0, rej = 0, tr = 0, tta = 0;
        for (UserCommitMetrics e : list) {
            tg += e.getTotalGenerated() != null ? e.getTotalGenerated() : 0;
            af += e.getAcceptedFirst() != null ? e.getAcceptedFirst() : 0;
            aar += e.getAcceptedAfterRegenerate() != null ? e.getAcceptedAfterRegenerate() : 0;
            rej += e.getRejected() != null ? e.getRejected() : 0;
            tr += e.getTotalRegenerations() != null ? e.getTotalRegenerations() : 0;
            tta += e.getTotalTimeToAcceptMs() != null ? e.getTotalTimeToAcceptMs() : 0;
        }
        long accepted = af + aar;
        long totalResp = accepted + rej;
        double acceptRate = totalResp > 0 ? (100.0 * accepted / totalResp) : 0;
        double firstTry = tg > 0 ? (100.0 * af / tg) : 0;
        double avgReg = aar > 0 ? (double) tr / aar : 0;
        long avgTime = accepted > 0 ? tta / accepted : 0;
        return CommitMetricsDto.builder()
                .totalGenerated(tg).acceptedFirst(af).acceptedAfterRegenerate(aar)
                .rejected(rej).totalRegenerations(tr).accepted(accepted)
                .acceptRatePercent(acceptRate).firstTryAcceptRatePercent(firstTry)
                .avgRegenerationsWhenRegenerated(avgReg).avgTimeToAcceptMs(avgTime)
                .build();
    }

    private PrMetricsDto aggregateDbPrMetrics() {
        List<UserPrMetrics> list = prMetricsRepo.findAll();
        long total = 0, withF = 0, withoutF = 0, timeWith = 0, timeWithout = 0, approved = 0, rejected = 0;
        for (UserPrMetrics e : list) {
            total += e.getTotalPrsAnalyzed() != null ? e.getTotalPrsAnalyzed() : 0;
            withF += e.getPrsWithFeatureCount() != null ? e.getPrsWithFeatureCount() : 0;
            withoutF += e.getPrsWithoutFeatureCount() != null ? e.getPrsWithoutFeatureCount() : 0;
            timeWith += e.getTotalReviewTimeWithFeatureMs() != null ? e.getTotalReviewTimeWithFeatureMs() : 0;
            timeWithout += e.getTotalReviewTimeWithoutFeatureMs() != null ? e.getTotalReviewTimeWithoutFeatureMs() : 0;
            approved += e.getApprovedCount() != null ? e.getApprovedCount() : 0;
            rejected += e.getRejectedCount() != null ? e.getRejectedCount() : 0;
        }
        long avgWith = withF > 0 ? timeWith / withF : 0;
        long avgWithout = withoutF > 0 ? timeWithout / withoutF : 0;
        double improve = avgWithout > 0 ? ((double) (avgWithout - avgWith) / avgWithout) * 100 : 0;
        return PrMetricsDto.builder()
                .totalPrsAnalyzed(total).prsWithFeatureCount(withF).prsWithoutFeatureCount(withoutF)
                .approvedCount(approved).rejectedCount(rejected)
                .totalReviewTimeWithFeatureMs(timeWith).totalReviewTimeWithoutFeatureMs(timeWithout)
                .avgReviewTimeWithFeatureMs(avgWith).avgReviewTimeWithoutFeatureMs(avgWithout)
                .reviewTimeImprovementPercent(improve)
                .build();
    }

    private CommitMetricsDto emptyCommitMetrics() {
        return CommitMetricsDto.builder()
                .totalCommits(0).aiGeneratedCount(0).manualCount(0).aiAdoptionRatePercent(0)
                .totalGenerated(0).acceptedFirst(0).acceptedAfterRegenerate(0).rejected(0)
                .totalRegenerations(0).accepted(0).acceptRatePercent(0).firstTryAcceptRatePercent(0)
                .avgRegenerationsWhenRegenerated(0).avgTimeToAcceptMs(0)
                .build();
    }

    private PrMetricsDto emptyPrMetrics() {
        return PrMetricsDto.builder()
                .totalPrs(0).openCount(0).reviewingCount(0).approvedCount(0).rejectedCount(0).mergedCount(0)
                .withRiskAnalysisCount(0)
                .totalPrsAnalyzed(0).prsWithFeatureCount(0).prsWithoutFeatureCount(0)
                .totalReviewTimeWithFeatureMs(0).totalReviewTimeWithoutFeatureMs(0)
                .avgReviewTimeWithFeatureMs(0).avgReviewTimeWithoutFeatureMs(0)
                .reviewTimeImprovementPercent(0)
                .build();
    }

    /** Record PR approval (call when user approves a PR). */
    public void recordPrApproved(String reviewerUsername, long reviewTimeMs, boolean hadPrSummaryFeature) {
        UserPrMetrics m = prMetricsRepo.findByUsernameIgnoreCase(reviewerUsername)
                .orElseGet(() -> {
                    var newM = UserPrMetrics.builder().username(reviewerUsername).build();
                    return prMetricsRepo.save(newM);
                });
        m.setTotalPrsAnalyzed((m.getTotalPrsAnalyzed() != null ? m.getTotalPrsAnalyzed() : 0) + 1);
        m.setApprovedCount((m.getApprovedCount() != null ? m.getApprovedCount() : 0) + 1);
        if (hadPrSummaryFeature) {
            m.setPrsWithFeatureCount((m.getPrsWithFeatureCount() != null ? m.getPrsWithFeatureCount() : 0) + 1);
            m.setTotalReviewTimeWithFeatureMs((m.getTotalReviewTimeWithFeatureMs() != null ? m.getTotalReviewTimeWithFeatureMs() : 0) + reviewTimeMs);
        } else {
            m.setPrsWithoutFeatureCount((m.getPrsWithoutFeatureCount() != null ? m.getPrsWithoutFeatureCount() : 0) + 1);
            m.setTotalReviewTimeWithoutFeatureMs((m.getTotalReviewTimeWithoutFeatureMs() != null ? m.getTotalReviewTimeWithoutFeatureMs() : 0) + reviewTimeMs);
        }
        prMetricsRepo.save(m);
    }

    /** Record PR rejection. */
    public void recordPrRejected(String reviewerUsername) {
        UserPrMetrics m = prMetricsRepo.findByUsernameIgnoreCase(reviewerUsername)
                .orElseGet(() -> {
                    var newM = UserPrMetrics.builder().username(reviewerUsername).build();
                    return prMetricsRepo.save(newM);
                });
        m.setTotalPrsAnalyzed((m.getTotalPrsAnalyzed() != null ? m.getTotalPrsAnalyzed() : 0) + 1);
        m.setRejectedCount((m.getRejectedCount() != null ? m.getRejectedCount() : 0) + 1);
        prMetricsRepo.save(m);
    }

    /** Record or update commit metrics (for sync from CLI). */
    public void upsertCommitMetrics(String username, long totalGenerated, long acceptedFirst,
                                    long acceptedAfterRegenerate, long rejected, long totalRegenerations, long totalTimeToAcceptMs) {
        UserCommitMetrics m = commitMetricsRepo.findByUsernameIgnoreCase(username)
                .orElseGet(() -> {
                    var newM = UserCommitMetrics.builder().username(username).build();
                    return commitMetricsRepo.save(newM);
                });
        m.setTotalGenerated(totalGenerated);
        m.setAcceptedFirst(acceptedFirst);
        m.setAcceptedAfterRegenerate(acceptedAfterRegenerate);
        m.setRejected(rejected);
        m.setTotalRegenerations(totalRegenerations);
        m.setTotalTimeToAcceptMs(totalTimeToAcceptMs);
        commitMetricsRepo.save(m);
    }
}
