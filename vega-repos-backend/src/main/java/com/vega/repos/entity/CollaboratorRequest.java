package com.vega.repos.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Collaborator access request - user requests to be added to a repo.
 * Owner approves or rejects.
 */
@Entity
@Table(name = "collaborator_request")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CollaboratorRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "requester_username", nullable = false, length = 100)
    private String requesterUsername;

    @Column(name = "owner_username", nullable = false, length = 100)
    private String ownerUsername;

    @Column(name = "repo_name", nullable = false, length = 255)
    private String repoName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(name = "message", length = 500)
    private String message;

    /** When set: owner invited requester. Requester approves. When null: requester requested, owner approves. */
    @Column(name = "invited_by_username", length = 100)
    private String invitedByUsername;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "responded_at")
    private Instant respondedAt;

    public enum Status {
        PENDING, APPROVED, REJECTED
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
