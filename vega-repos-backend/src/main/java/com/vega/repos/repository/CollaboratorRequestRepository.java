package com.vega.repos.repository;

import com.vega.repos.entity.CollaboratorRequest;
import com.vega.repos.entity.CollaboratorRequest.Status;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CollaboratorRequestRepository extends JpaRepository<CollaboratorRequest, Long> {

    List<CollaboratorRequest> findByOwnerUsernameAndRepoNameAndStatus(
            String ownerUsername, String repoName, Status status);

    List<CollaboratorRequest> findByOwnerUsernameAndStatus(String ownerUsername, Status status);

    List<CollaboratorRequest> findByRequesterUsernameAndStatus(String requesterUsername, Status status);

    Optional<CollaboratorRequest> findByOwnerUsernameAndRepoNameAndRequesterUsernameAndStatus(
            String ownerUsername, String repoName, String requesterUsername, Status status);

    /** Pending invites TO this user (they must approve). */
    List<CollaboratorRequest> findByRequesterUsernameAndInvitedByUsernameIsNotNullAndStatus(
            String requesterUsername, Status status);

    /** Pending invites sent by owner for this repo. */
    List<CollaboratorRequest> findByOwnerUsernameAndRepoNameAndInvitedByUsernameIsNotNullAndStatus(
            String ownerUsername, String repoName, Status status);
}
