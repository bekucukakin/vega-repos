package com.vega.repos.repository;

import com.vega.repos.entity.RepoCollaborator;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RepoCollaboratorRepository extends JpaRepository<RepoCollaborator, Long> {

    List<RepoCollaborator> findByCollaboratorUsername(String collaboratorUsername);

    /** Case-insensitive: so shared repos appear regardless of login/display name casing. */
    List<RepoCollaborator> findByCollaboratorUsernameIgnoreCase(String collaboratorUsername);

    List<RepoCollaborator> findByOwnerUsernameAndRepoName(String ownerUsername, String repoName);

    Optional<RepoCollaborator> findByOwnerUsernameAndRepoNameAndCollaboratorUsername(
            String ownerUsername, String repoName, String collaboratorUsername);

    boolean existsByOwnerUsernameAndRepoNameAndCollaboratorUsername(
            String ownerUsername, String repoName, String collaboratorUsername);

    void deleteByOwnerUsernameAndRepoNameAndCollaboratorUsername(
            String ownerUsername, String repoName, String collaboratorUsername);

    /** Find all collaborators with a specific role in a repo. */
    List<RepoCollaborator> findByOwnerUsernameAndRepoNameAndRole(
            String ownerUsername, String repoName, String role);

    /**
     * True if {@code ownerUsername} owns at least one repo where {@code collaboratorUsername} is a collaborator.
     * Used by metrics permission check: owners/maintainers can view collaborator metrics.
     */
    boolean existsByOwnerUsernameAndCollaboratorUsername(String ownerUsername, String collaboratorUsername);
}
