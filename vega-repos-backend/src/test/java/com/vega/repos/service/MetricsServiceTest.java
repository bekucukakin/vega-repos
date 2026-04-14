package com.vega.repos.service;

import com.vega.repos.dto.CommitDto;
import com.vega.repos.dto.PrDto;
import com.vega.repos.dto.RepoDto;
import com.vega.repos.dto.VegaMetricsDto;
import com.vega.repos.entity.UserPrMetrics;
import com.vega.repos.repository.UserCommitMetricsRepository;
import com.vega.repos.repository.UserPrMetricsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MetricsServiceTest {

    @Mock private UserCommitMetricsRepository commitMetricsRepo;
    @Mock private UserPrMetricsRepository prMetricsRepo;
    @Mock private RepoService repoService;

    private MetricsService metricsService;

    @BeforeEach
    void setUp() {
        metricsService = new MetricsService(commitMetricsRepo, prMetricsRepo, repoService);
    }

    // -----------------------------------------------------------------------
    // recordPrApproved
    // -----------------------------------------------------------------------

    @Test
    void recordPrApproved_createsNewRecordWhenNoneExists() {
        when(prMetricsRepo.findByUsernameIgnoreCase("reviewer")).thenReturn(Optional.empty());
        when(prMetricsRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        metricsService.recordPrApproved("reviewer", 5000L, true);

        ArgumentCaptor<UserPrMetrics> captor = ArgumentCaptor.forClass(UserPrMetrics.class);
        verify(prMetricsRepo, times(2)).save(captor.capture()); // once for create, once for update
        UserPrMetrics saved = captor.getAllValues().get(1);
        assertEquals(1L, saved.getTotalPrsAnalyzed());
        assertEquals(1L, saved.getApprovedCount());
        assertEquals(1L, saved.getPrsWithFeatureCount());
        assertEquals(5000L, saved.getTotalReviewTimeWithFeatureMs());
        assertEquals(0L, saved.getPrsWithoutFeatureCount());
    }

    @Test
    void recordPrApproved_updatesExistingRecord() {
        UserPrMetrics existing = UserPrMetrics.builder()
                .username("reviewer").totalPrsAnalyzed(3L).approvedCount(2L)
                .prsWithoutFeatureCount(3L).totalReviewTimeWithoutFeatureMs(9000L).build();
        when(prMetricsRepo.findByUsernameIgnoreCase("reviewer")).thenReturn(Optional.of(existing));
        when(prMetricsRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        metricsService.recordPrApproved("reviewer", 3000L, false);

        ArgumentCaptor<UserPrMetrics> captor = ArgumentCaptor.forClass(UserPrMetrics.class);
        verify(prMetricsRepo).save(captor.capture());
        UserPrMetrics saved = captor.getValue();
        assertEquals(4L, saved.getTotalPrsAnalyzed());
        assertEquals(3L, saved.getApprovedCount());
        assertEquals(4L, saved.getPrsWithoutFeatureCount());
        assertEquals(12000L, saved.getTotalReviewTimeWithoutFeatureMs());
    }

    // -----------------------------------------------------------------------
    // recordPrRejected
    // -----------------------------------------------------------------------

    @Test
    void recordPrRejected_updatesFeatureGroupCounts() {
        when(prMetricsRepo.findByUsernameIgnoreCase("rev")).thenReturn(Optional.empty());
        when(prMetricsRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        metricsService.recordPrRejected("rev", 8000L, true);

        ArgumentCaptor<UserPrMetrics> captor = ArgumentCaptor.forClass(UserPrMetrics.class);
        verify(prMetricsRepo, times(2)).save(captor.capture());
        UserPrMetrics saved = captor.getAllValues().get(1);
        assertEquals(1L, saved.getTotalPrsAnalyzed());
        assertEquals(1L, saved.getRejectedCount());
        assertEquals(1L, saved.getPrsWithFeatureCount());
        assertEquals(8000L, saved.getTotalReviewTimeWithFeatureMs());
        assertEquals(0L, saved.getPrsWithoutFeatureCount());
    }

    @Test
    void recordPrRejected_withoutFeature_updatesWithoutFeatureGroup() {
        when(prMetricsRepo.findByUsernameIgnoreCase("rev")).thenReturn(Optional.empty());
        when(prMetricsRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        metricsService.recordPrRejected("rev", 4000L, false);

        ArgumentCaptor<UserPrMetrics> captor = ArgumentCaptor.forClass(UserPrMetrics.class);
        verify(prMetricsRepo, times(2)).save(captor.capture());
        UserPrMetrics saved = captor.getAllValues().get(1);
        assertEquals(1L, saved.getRejectedCount());
        assertEquals(0L, saved.getPrsWithFeatureCount());
        assertEquals(1L, saved.getPrsWithoutFeatureCount());
        assertEquals(4000L, saved.getTotalReviewTimeWithoutFeatureMs());
    }

    // -----------------------------------------------------------------------
    // computePrMetrics — author filtering (BUG 6)
    // -----------------------------------------------------------------------

    @Test
    void getMetricsForUser_onlyCountsPrsAuthoredByUser() {
        RepoDto repo = RepoDto.builder().name("my-repo").build();
        PrDto myPr = PrDto.builder().author("alice").status("OPEN").build();
        PrDto otherPr = PrDto.builder().author("bob").status("MERGED").build(); // should be excluded

        when(repoService.listRepositories("alice")).thenReturn(List.of(repo));
        when(repoService.getCommits("alice", "my-repo", 500)).thenReturn(List.of());
        when(repoService.getPullRequests("alice", "my-repo")).thenReturn(List.of(myPr, otherPr));
        when(prMetricsRepo.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());
        when(commitMetricsRepo.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());

        VegaMetricsDto result = metricsService.getMetricsForUser("alice");

        assertEquals(1L, result.getPrMetrics().getTotalPrs());
        assertEquals(1L, result.getPrMetrics().getOpenCount());
        assertEquals(0L, result.getPrMetrics().getMergedCount());
    }

    @Test
    void getMetricsForUser_reviewerCountsComeFromDb_notHdfs() {
        RepoDto repo = RepoDto.builder().name("my-repo").build();
        PrDto pr = PrDto.builder().author("alice").status("MERGED").build();

        UserPrMetrics dbMetrics = UserPrMetrics.builder()
                .username("alice").totalPrsAnalyzed(5L).approvedCount(3L).rejectedCount(2L)
                .prsWithFeatureCount(4L).prsWithoutFeatureCount(1L)
                .totalReviewTimeWithFeatureMs(20000L).totalReviewTimeWithoutFeatureMs(5000L)
                .build();

        when(repoService.listRepositories("alice")).thenReturn(List.of(repo));
        when(repoService.getCommits("alice", "my-repo", 500)).thenReturn(List.of());
        when(repoService.getPullRequests("alice", "my-repo")).thenReturn(List.of(pr));
        when(prMetricsRepo.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(dbMetrics));
        when(commitMetricsRepo.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());

        VegaMetricsDto result = metricsService.getMetricsForUser("alice");

        // HDFS counts: 1 merged PR authored by alice
        assertEquals(1L, result.getPrMetrics().getTotalPrs());
        assertEquals(1L, result.getPrMetrics().getMergedCount());
        assertEquals(0L, result.getPrMetrics().getApprovedCount()); // no APPROVED status in HDFS
        // DB reviewer counts are in separate fields
        assertEquals(3L, result.getPrMetrics().getReviewerApprovedCount());
        assertEquals(2L, result.getPrMetrics().getReviewerRejectedCount());
    }

    // -----------------------------------------------------------------------
    // Global metrics cache (BUG 5)
    // -----------------------------------------------------------------------

    @Test
    void getGlobalMetrics_returnsCachedResultOnSecondCall() {
        when(repoService.listAllUsernames()).thenReturn(List.of());
        when(prMetricsRepo.findAll()).thenReturn(List.of());
        when(commitMetricsRepo.findAll()).thenReturn(List.of());

        metricsService.getGlobalMetrics();
        metricsService.getGlobalMetrics();

        // listAllUsernames should only be called once (second call uses cache)
        verify(repoService, times(1)).listAllUsernames();
    }

    @Test
    void getGlobalMetrics_doesNotDoubleCountApprovedRejected() {
        RepoDto repo = RepoDto.builder().name("repo").build();
        PrDto approvedPr = PrDto.builder().author("user1").status("APPROVED").build();
        PrDto mergedPr = PrDto.builder().author("user1").status("MERGED").build();

        UserPrMetrics dbReviewerMetrics = UserPrMetrics.builder()
                .username("user1").approvedCount(5L).rejectedCount(2L).build();

        when(repoService.listAllUsernames()).thenReturn(List.of("user1"));
        when(repoService.listRepositories("user1")).thenReturn(List.of(repo));
        when(repoService.getCommits("user1", "repo", 500)).thenReturn(List.of());
        when(repoService.getPullRequests("user1", "repo")).thenReturn(List.of(approvedPr, mergedPr));
        when(prMetricsRepo.findAll()).thenReturn(List.of(dbReviewerMetrics));
        when(commitMetricsRepo.findAll()).thenReturn(List.of());

        VegaMetricsDto result = metricsService.getGlobalMetrics();

        // approvedCount must be from HDFS status only (1 APPROVED PR), not DB+HDFS combined
        assertEquals(1L, result.getPrMetrics().getApprovedCount());
        assertEquals(0L, result.getPrMetrics().getRejectedCount());
        assertEquals(1L, result.getPrMetrics().getMergedCount());
        // DB reviewer counts go into separate fields
        assertEquals(5L, result.getPrMetrics().getReviewerApprovedCount());
        assertEquals(2L, result.getPrMetrics().getReviewerRejectedCount());
    }
}
