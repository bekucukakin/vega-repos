package com.vega.repos.repository;

import com.vega.repos.entity.CommitInsight;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommitInsightRepository extends JpaRepository<CommitInsight, Long> {

    /** All insights for a commit, sorted by likes descending (best first). */
    List<CommitInsight> findByOwnerUsernameAndRepoNameAndCommitHashOrderByLikesDescCreatedAtAsc(
            String ownerUsername, String repoName, String commitHash);
}
