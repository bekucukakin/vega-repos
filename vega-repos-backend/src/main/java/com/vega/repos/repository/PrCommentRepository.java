package com.vega.repos.repository;

import com.vega.repos.entity.PrComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PrCommentRepository extends JpaRepository<PrComment, Long> {

    List<PrComment> findByOwnerUsernameAndRepoNameAndPrIdAndDeletedFalseOrderByCreatedAtAsc(
        String ownerUsername, String repoName, String prId);
}
