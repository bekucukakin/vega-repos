package com.vega.repos.service;

import com.vega.repos.entity.RepoCollaborator;
import com.vega.repos.repository.RepoCollaboratorRepository;
import com.vega.repos.repository.RepoSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestTemplate;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RepoAccessServiceTest {

    @Mock
    private RestTemplate restTemplate;
    @Mock
    private RepoCollaboratorRepository collaboratorRepository;
    @Mock
    private RepoSettingsRepository repoSettingsRepository;
    @Mock
    private UserServiceJwtParser userServiceJwtParser;

    private RepoAccessService repoAccessService;

    @BeforeEach
    void setUp() {
        repoAccessService = new RepoAccessService(
                restTemplate,
                collaboratorRepository,
                repoSettingsRepository,
                userServiceJwtParser
        );
    }

    @Test
    void shouldGrantExpectedPermissionsForDeveloper() {
        RepoCollaborator developer = RepoCollaborator.builder()
                .ownerUsername("owner")
                .repoName("repo")
                .collaboratorUsername("dev")
                .role("developer")
                .canCreatePr(true)
                .build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "dev"))
                .thenReturn(Optional.of(developer));

        assertTrue(repoAccessService.canCreatePrInRepo("dev", "owner", "repo"));
        assertFalse(repoAccessService.canApprovePrInRepo("dev", "owner", "repo"));
        assertTrue(repoAccessService.canMergePrInRepo("dev", "owner", "repo"));
        assertTrue(repoAccessService.canPushToFeatureBranch("dev", "owner", "repo"));
        assertTrue(repoAccessService.canPushToProtectedBranch("dev", "owner", "repo"));
    }

    @Test
    void shouldGrantExpectedPermissionsForReviewer() {
        RepoCollaborator reviewer = RepoCollaborator.builder()
                .ownerUsername("owner")
                .repoName("repo")
                .collaboratorUsername("reviewer")
                .role("reviewer")
                .canCreatePr(false)
                .build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "reviewer"))
                .thenReturn(Optional.of(reviewer));

        assertFalse(repoAccessService.canCreatePrInRepo("reviewer", "owner", "repo"));
        assertTrue(repoAccessService.canApprovePrInRepo("reviewer", "owner", "repo"));
        assertFalse(repoAccessService.canMergePrInRepo("reviewer", "owner", "repo"));
        assertFalse(repoAccessService.canPushToFeatureBranch("reviewer", "owner", "repo"));
    }

    @Test
    void shouldGrantReadOnlyPermissionsForReader() {
        RepoCollaborator reader = RepoCollaborator.builder()
                .ownerUsername("owner")
                .repoName("repo")
                .collaboratorUsername("reader")
                .role("reader")
                .canCreatePr(false)
                .build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "reader"))
                .thenReturn(Optional.of(reader));

        assertFalse(repoAccessService.canCreatePrInRepo("reader", "owner", "repo"));
        assertFalse(repoAccessService.canApprovePrInRepo("reader", "owner", "repo"));
        assertFalse(repoAccessService.canMergePrInRepo("reader", "owner", "repo"));
        assertFalse(repoAccessService.canPushToFeatureBranch("reader", "owner", "repo"));
        assertFalse(repoAccessService.canPushToProtectedBranch("reader", "owner", "repo"));
    }

    @Test
    void shouldGrantFullWriteAndManagePermissionsForMaintainer() {
        RepoCollaborator maintainer = RepoCollaborator.builder()
                .ownerUsername("owner")
                .repoName("repo")
                .collaboratorUsername("maintainer-user")
                .role("maintainer")
                .canCreatePr(true)
                .build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "maintainer-user"))
                .thenReturn(Optional.of(maintainer));

        // Write capabilities
        assertTrue(repoAccessService.canPushToFeatureBranch("maintainer-user", "owner", "repo"));
        assertTrue(repoAccessService.canPushToProtectedBranch("maintainer-user", "owner", "repo"));
        assertTrue(repoAccessService.canCreatePrInRepo("maintainer-user", "owner", "repo"));
        assertTrue(repoAccessService.canMergePrInRepo("maintainer-user", "owner", "repo"));

        // Review capability (unlike pure developer)
        assertTrue(repoAccessService.canApprovePrInRepo("maintainer-user", "owner", "repo"));

        // Management capabilities
        assertTrue(repoAccessService.canManageCollaborators("maintainer-user", "owner", "repo"));
        assertTrue(repoAccessService.canChangeRepoSettings("maintainer-user", "owner", "repo"));
    }

    @Test
    void maintainerCanManageCollaborators_developerAndReviewerCannot() {
        RepoCollaborator dev = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("dev").role("developer").canCreatePr(true).build();
        RepoCollaborator rev = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("rev").role("reviewer").canCreatePr(false).build();
        RepoCollaborator maint = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("maint").role("maintainer").canCreatePr(true).build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "dev"))
                .thenReturn(Optional.of(dev));
        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "rev"))
                .thenReturn(Optional.of(rev));
        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "maint"))
                .thenReturn(Optional.of(maint));

        assertFalse(repoAccessService.canManageCollaborators("dev", "owner", "repo"));
        assertFalse(repoAccessService.canManageCollaborators("rev", "owner", "repo"));
        assertTrue(repoAccessService.canManageCollaborators("maint", "owner", "repo"));

        // Owner always can
        assertTrue(repoAccessService.canManageCollaborators("owner", "owner", "repo"));
    }

    @Test
    void maintainerCanChangeRepoSettings_developerAndReviewerCannot() {
        RepoCollaborator dev = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("dev").role("developer").canCreatePr(true).build();
        RepoCollaborator maint = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("maint").role("maintainer").canCreatePr(true).build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "dev"))
                .thenReturn(Optional.of(dev));
        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "maint"))
                .thenReturn(Optional.of(maint));

        assertFalse(repoAccessService.canChangeRepoSettings("dev", "owner", "repo"));
        assertTrue(repoAccessService.canChangeRepoSettings("maint", "owner", "repo"));
        assertTrue(repoAccessService.canChangeRepoSettings("owner", "owner", "repo"));
    }

    @Test
    void maintainerCanCreatePrWithoutCanCreatePrFlag() {
        // Maintainer bypasses the canCreatePr boolean flag entirely
        RepoCollaborator maintainer = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("maint").role("maintainer")
                .canCreatePr(false) // flag is false — should not matter for maintainer
                .build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "maint"))
                .thenReturn(Optional.of(maintainer));

        assertTrue(repoAccessService.canCreatePrInRepo("maint", "owner", "repo"));
    }

    @Test
    void developerWithFlagFalseCannotCreatePr() {
        RepoCollaborator dev = RepoCollaborator.builder()
                .ownerUsername("owner").repoName("repo")
                .collaboratorUsername("dev").role("developer")
                .canCreatePr(false)
                .build();

        when(collaboratorRepository.findByOwnerUsernameAndRepoNameAndCollaboratorUsername("owner", "repo", "dev"))
                .thenReturn(Optional.of(dev));

        assertFalse(repoAccessService.canCreatePrInRepo("dev", "owner", "repo"));
    }

    @Test
    void ownerAlwaysHasAllPermissions() {
        assertTrue(repoAccessService.canCreatePrInRepo("owner", "owner", "repo"));
        assertTrue(repoAccessService.canApprovePrInRepo("owner", "owner", "repo"));
        assertTrue(repoAccessService.canMergePrInRepo("owner", "owner", "repo"));
        assertTrue(repoAccessService.canPushToFeatureBranch("owner", "owner", "repo"));
        assertTrue(repoAccessService.canPushToProtectedBranch("owner", "owner", "repo"));
        assertTrue(repoAccessService.canManageCollaborators("owner", "owner", "repo"));
        assertTrue(repoAccessService.canChangeRepoSettings("owner", "owner", "repo"));
    }

    @Test
    void shouldDenyAllActionsForUnauthorizedUser() {
        assertFalse(repoAccessService.canAccess(null, "owner", "repo"));
        assertFalse(repoAccessService.canCreatePrInRepo(null, "owner", "repo"));
        assertFalse(repoAccessService.canApprovePrInRepo(null, "owner", "repo"));
        assertFalse(repoAccessService.canMergePrInRepo(null, "owner", "repo"));
        assertFalse(repoAccessService.canPushToFeatureBranch(null, "owner", "repo"));
        assertFalse(repoAccessService.canManageCollaborators(null, "owner", "repo"));
        assertFalse(repoAccessService.canChangeRepoSettings(null, "owner", "repo"));
    }
}
