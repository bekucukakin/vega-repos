package com.vega.repos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vega.repos.dto.PrDto;
import com.vega.repos.service.MetricsService;
import com.vega.repos.service.RepoAccessService;
import com.vega.repos.service.RepoDownloadService;
import com.vega.repos.service.RepoFileService;
import com.vega.repos.service.RepoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RepoController.class)
class RepoControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private RepoService repoService;
    @MockBean
    private RepoDownloadService repoDownloadService;
    @MockBean
    private RepoFileService repoFileService;
    @MockBean
    private RepoAccessService repoAccessService;
    @MockBean
    private MetricsService metricsService;

    @Test
    void prFlow_shouldAllowDeveloperToCreatePr() throws Exception {
        PrDto createdPr = PrDto.builder()
                .id("PR-1")
                .author("dev")
                .sourceBranch("feature/test")
                .targetBranch("main")
                .status("OPEN")
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("dev");
        when(repoAccessService.canAccess("dev", "owner", "repo")).thenReturn(true);
        when(repoAccessService.canCreatePrInRepo("dev", "owner", "repo")).thenReturn(true);
        when(repoService.createPullRequest("owner", "repo", "feature/test", "main", "dev", "desc", null, null))
                .thenReturn(createdPr);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sourceBranch", "feature/test",
                                "targetBranch", "main",
                                "description", "desc"
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("PR-1"))
                .andExpect(jsonPath("$.author").value("dev"));
    }

    @Test
    void pushFlow_shouldReturnCanPushTrueForDeveloper() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("dev");
        when(repoAccessService.canPushToFeatureBranch("dev", "owner", "repo")).thenReturn(true);

        mockMvc.perform(get("/api/repos/owner/repo/push-access")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canPush").value(true));
    }

    @Test
    void negative_shouldReturnCanPushFalseForReviewer() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("reviewer");
        when(repoAccessService.canPushToFeatureBranch("reviewer", "owner", "repo")).thenReturn(false);

        mockMvc.perform(get("/api/repos/owner/repo/push-access")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canPush").value(false));
    }

    @Test
    void negative_shouldRejectReaderPrCreation() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("reader");
        when(repoAccessService.canAccess("reader", "owner", "repo")).thenReturn(true);
        when(repoAccessService.canCreatePrInRepo("reader", "owner", "repo")).thenReturn(false);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sourceBranch", "feature/read-only",
                                "targetBranch", "main"
                        ))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Only owner, maintainer, or developer collaborators can create pull requests"));
    }

    // --- Maintainer tests ---

    @Test
    void pushFlow_shouldReturnCanPushTrueForMaintainer() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canPushToFeatureBranch("maint", "owner", "repo")).thenReturn(true);

        mockMvc.perform(get("/api/repos/owner/repo/push-access")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canPush").value(true));
    }

    @Test
    void prFlow_shouldAllowMaintainerToCreatePr() throws Exception {
        PrDto createdPr = PrDto.builder()
                .id("PR-2")
                .author("maint")
                .sourceBranch("feature/maint-branch")
                .targetBranch("main")
                .status("OPEN")
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canAccess("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.canCreatePrInRepo("maint", "owner", "repo")).thenReturn(true);
        when(repoService.createPullRequest("owner", "repo", "feature/maint-branch", "main", "maint", "", null, null))
                .thenReturn(createdPr);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sourceBranch", "feature/maint-branch",
                                "targetBranch", "main"
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("PR-2"))
                .andExpect(jsonPath("$.author").value("maint"));
    }

    @Test
    void prFlow_maintainerCanApproveSomeoneElsesPr() throws Exception {
        PrDto pr = PrDto.builder()
                .id("PR-3")
                .author("dev")   // PR sahibi dev, maintainer approve ediyor
                .status("OPEN")
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canApprovePrInRepo("maint", "owner", "repo")).thenReturn(true);
        when(repoService.getPullRequest("owner", "repo", "PR-3")).thenReturn(pr);
        when(repoService.updatePullRequestApprove("owner", "repo", "PR-3", "maint")).thenReturn(true);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-3/approve")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk());
    }

    @Test
    void prFlow_maintainerCannotApproveSelf() throws Exception {
        PrDto pr = PrDto.builder()
                .id("PR-4")
                .author("maint")  // Kendi PR'ı
                .status("OPEN")
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canApprovePrInRepo("maint", "owner", "repo")).thenReturn(true);
        when(repoService.getPullRequest("owner", "repo", "PR-4")).thenReturn(pr);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-4/approve")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void prFlow_maintainerCannotSelfMergeWithoutApproval() throws Exception {
        PrDto pr = PrDto.builder()
                .id("PR-5")
                .author("maint")  // Kendi PR'ı, approvedBy null
                .status("APPROVED")
                .approvedBy(null)
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canMergePrInRepo("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.getCollaboratorRole("maint", "owner", "repo")).thenReturn("maintainer");
        when(repoService.getPullRequest("owner", "repo", "PR-5")).thenReturn(pr);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-5/merge")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void prFlow_maintainerCanMergeOwnPrIfApprovedByOther() throws Exception {
        PrDto pr = PrDto.builder()
                .id("PR-6")
                .author("maint")
                .status("APPROVED")
                .approvedBy("reviewer-user")  // Başkası approve etmiş
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canMergePrInRepo("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.getCollaboratorRole("maint", "owner", "repo")).thenReturn("maintainer");
        when(repoService.getPullRequest("owner", "repo", "PR-6")).thenReturn(pr);
        when(repoService.mergePullRequest("owner", "repo", "PR-6", "maint")).thenReturn(null);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-6/merge")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("merged"));
    }

    @Test
    void settings_maintainerCanChangeRepoSettings() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canChangeRepoSettings("maint", "owner", "repo")).thenReturn(true);

        mockMvc.perform(post("/api/repos/owner/repo/settings")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("isPublic", true))))
                .andExpect(status().isOk());
    }

    @Test
    void settings_developerCannotChangeRepoSettings() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("dev");
        when(repoAccessService.canChangeRepoSettings("dev", "owner", "repo")).thenReturn(false);

        mockMvc.perform(post("/api/repos/owner/repo/settings")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("isPublic", true))))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthorized_shouldReturn401WhenTokenMissing() throws Exception {
        when(repoAccessService.resolveUsername(null)).thenReturn(null);

        mockMvc.perform(get("/api/repos/owner/repo/push-access"))
                .andExpect(status().isUnauthorized());
    }

    // -----------------------------------------------------------------------
    // Metrics integration: approve/reject record correct data
    // -----------------------------------------------------------------------

    @Test
    void metrics_approvePr_callsRecordPrApprovedWithComputedTime() throws Exception {
        // PR has reviewStartedAt set and riskLevel set → hadFeature=true, reviewTimeMs > 0
        PrDto pr = PrDto.builder()
                .id("PR-10")
                .author("dev")
                .status("REVIEWING")
                .riskLevel("HIGH")
                .reviewStartedAt(System.currentTimeMillis() - 5000L) // 5s ago
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("reviewer");
        when(repoAccessService.canApprovePrInRepo("reviewer", "owner", "repo")).thenReturn(true);
        when(repoService.getPullRequest("owner", "repo", "PR-10")).thenReturn(pr);
        when(repoService.updatePullRequestApprove("owner", "repo", "PR-10", "reviewer")).thenReturn(true);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-10/approve")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk());

        // Verify recordPrApproved is called with hadFeature=true and reviewTimeMs > 0
        verify(metricsService).recordPrApproved(eq("reviewer"), longThat(ms -> ms > 0), eq(true));
    }

    @Test
    void metrics_approvePr_callsRecordPrApprovedWithZeroTimeWhenNoStartTimestamp() throws Exception {
        PrDto pr = PrDto.builder()
                .id("PR-11")
                .author("dev")
                .status("REVIEWING")
                .riskLevel(null) // no risk analysis → hadFeature=false
                .reviewStartedAt(null)
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("reviewer");
        when(repoAccessService.canApprovePrInRepo("reviewer", "owner", "repo")).thenReturn(true);
        when(repoService.getPullRequest("owner", "repo", "PR-11")).thenReturn(pr);
        when(repoService.updatePullRequestApprove("owner", "repo", "PR-11", "reviewer")).thenReturn(true);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-11/approve")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk());

        verify(metricsService).recordPrApproved("reviewer", 0L, false);
    }

    @Test
    void metrics_rejectPr_callsRecordPrRejectedWithTimeAndFeatureFlag() throws Exception {
        PrDto pr = PrDto.builder()
                .id("PR-12")
                .author("dev")
                .status("REVIEWING")
                .riskLevel("LOW")
                .reviewStartedAt(System.currentTimeMillis() - 3000L)
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("reviewer");
        when(repoAccessService.canApprovePrInRepo("reviewer", "owner", "repo")).thenReturn(true);
        when(repoService.getPullRequest("owner", "repo", "PR-12")).thenReturn(pr);
        when(repoService.updatePullRequestReject("owner", "repo", "PR-12", "reviewer")).thenReturn(true);

        mockMvc.perform(post("/api/repos/owner/repo/pull-requests/PR-12/reject")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk());

        verify(metricsService).recordPrRejected(eq("reviewer"), longThat(ms -> ms > 0), eq(true));
    }
}
