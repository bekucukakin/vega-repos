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

    /**
     * Collaborator role: "developer" (can create/push PRs, cannot approve own PR)
     * or "reviewer" (can only review/approve/reject PRs, cannot create PRs or push).
     * DB column must not be {@code ROLE} — reserved in H2; old DBs may lack this column until ddl-auto adds it.
     */
    @Column(name = "collaborator_role", nullable = false, length = 50)
    @Builder.Default
    private String role = "developer";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
