package com.vega.repos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vega.repos.dto.CollaboratorRequestDto;
import com.vega.repos.service.CollaboratorService;
import com.vega.repos.service.RepoAccessService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CollaboratorController.class)
class CollaboratorControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private CollaboratorService collaboratorService;
    @MockBean
    private RepoAccessService repoAccessService;

    // -----------------------------------------------------------------------
    // Invite flow
    // -----------------------------------------------------------------------

    @Test
    void inviteFlow_ownerCanCreateReaderInvite() throws Exception {
        CollaboratorRequestDto invite = CollaboratorRequestDto.builder()
                .id(10L)
                .ownerUsername("owner")
                .repoName("repo")
                .requesterUsername("guest")
                .role("reader")
                .status("PENDING")
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("owner");
        // Controller uses canManageCollaborators, NOT isOwner
        when(repoAccessService.canManageCollaborators("owner", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("owner", "owner")).thenReturn(true);
        when(collaboratorService.inviteCollaborator("owner", "repo", "guest", "reader"))
                .thenReturn(invite);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/invite")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "guest",
                                "role", "reader"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10L))
                .andExpect(jsonPath("$.role").value("reader"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void inviteFlow_maintainerCanInviteDeveloper() throws Exception {
        CollaboratorRequestDto invite = CollaboratorRequestDto.builder()
                .id(11L)
                .ownerUsername("owner")
                .repoName("repo")
                .requesterUsername("new-dev")
                .role("developer")
                .status("PENDING")
                .build();

        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);
        when(collaboratorService.inviteCollaborator("owner", "repo", "new-dev", "developer"))
                .thenReturn(invite);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/invite")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "new-dev",
                                "role", "developer"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("developer"));
    }

    @Test
    void inviteFlow_maintainerCannotInviteAsMaintainer() throws Exception {
        // Privilege escalation: maintainer tries to grant maintainer role
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/invite")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "someone",
                                "role", "maintainer"
                        ))))
                .andExpect(status().isForbidden());
    }

    @Test
    void inviteFlow_developerCannotInviteAtAll() throws Exception {
        // Developer has no collaborator management rights
        when(repoAccessService.resolveUsername(anyString())).thenReturn("dev");
        when(repoAccessService.canManageCollaborators("dev", "owner", "repo")).thenReturn(false);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/invite")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "someone",
                                "role", "reader"
                        ))))
                .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // Approve request flow
    // -----------------------------------------------------------------------

    @Test
    void approveRequest_ownerCanGrantMaintainerRole() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("owner");
        when(repoAccessService.canManageCollaborators("owner", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("owner", "owner")).thenReturn(true);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/requests/1/approve")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "maintainer"))))
                .andExpect(status().isOk());
    }

    @Test
    void approveRequest_maintainerCannotGrantMaintainerRole() throws Exception {
        // Privilege escalation: maintainer tries to approve as maintainer
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/requests/2/approve")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "maintainer"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void approveRequest_maintainerCanApproveAsDeveloper() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);

        mockMvc.perform(post("/api/repos/owner/repo/collaborators/requests/3/approve")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "developer"))))
                .andExpect(status().isOk());
    }

    // -----------------------------------------------------------------------
    // Role update flow
    // -----------------------------------------------------------------------

    @Test
    void updateRole_maintainerCannotDemoteAnotherMaintainer() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);
        // Target is also a maintainer
        when(repoAccessService.getCollaboratorRole("other-maint", "owner", "repo")).thenReturn("maintainer");

        mockMvc.perform(patch("/api/repos/owner/repo/collaborators/other-maint/role")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "developer"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void updateRole_maintainerCanPromoteDeveloperToReviewer() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);
        when(repoAccessService.getCollaboratorRole("some-dev", "owner", "repo")).thenReturn("developer");

        mockMvc.perform(patch("/api/repos/owner/repo/collaborators/some-dev/role")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("role", "reviewer"))))
                .andExpect(status().isOk());
    }

    // -----------------------------------------------------------------------
    // Remove collaborator flow
    // -----------------------------------------------------------------------

    @Test
    void removeCollaborator_maintainerCannotRemoveAnotherMaintainer() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);
        when(repoAccessService.getCollaboratorRole("other-maint", "owner", "repo")).thenReturn("maintainer");

        mockMvc.perform(delete("/api/repos/owner/repo/collaborators/other-maint")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void removeCollaborator_maintainerCanRemoveDeveloper() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("maint");
        when(repoAccessService.canManageCollaborators("maint", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("maint", "owner")).thenReturn(false);
        when(repoAccessService.getCollaboratorRole("some-dev", "owner", "repo")).thenReturn("developer");

        mockMvc.perform(delete("/api/repos/owner/repo/collaborators/some-dev")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk());
    }

    @Test
    void removeCollaborator_ownerCanRemoveMaintainer() throws Exception {
        when(repoAccessService.resolveUsername(anyString())).thenReturn("owner");
        when(repoAccessService.canManageCollaborators("owner", "owner", "repo")).thenReturn(true);
        when(repoAccessService.isOwner("owner", "owner")).thenReturn(true);

        mockMvc.perform(delete("/api/repos/owner/repo/collaborators/maint")
                        .header("Authorization", "Bearer token"))
                .andExpect(status().isOk());
    }
}
