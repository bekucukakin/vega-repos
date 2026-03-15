package com.vega.repos.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Repo collaborator - owner grants access to another user.
 * Cloud-friendly: stored in Vega Repos DB.
 */
@Entity
@Table(name = "repo_collaborator", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"owner_username", "repo_name", "collaborator_username"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RepoCollaborator {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_username", nullable = false, length = 100)
    private String ownerUsername;

    @Column(name = "repo_name", nullable = false, length = 255)
    private String repoName;

    @Column(name = "collaborator_username", nullable = false, length = 100)
    private String collaboratorUsername;

    /**
     * Can create/approve/merge PRs. Owner always has this. Collaborators can have it.
     */
    @Column(name = "can_create_pr", nullable = false)
    @Builder.Default
    private Boolean canCreatePr = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
