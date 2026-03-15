package com.vega.repos.repository;

import com.vega.repos.entity.RepoSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RepoSettingsRepository extends JpaRepository<RepoSettings, Long> {

    Optional<RepoSettings> findByOwnerUsernameAndRepoName(String ownerUsername, String repoName);

    List<RepoSettings> findByIsPublicTrue();

    List<RepoSettings> findByOwnerUsername(String ownerUsername);

    boolean existsByOwnerUsernameAndRepoNameAndIsPublicTrue(String ownerUsername, String repoName);
}
