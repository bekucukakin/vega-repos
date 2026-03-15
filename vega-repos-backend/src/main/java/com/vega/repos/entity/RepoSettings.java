package com.vega.repos.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "repo_settings", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"owner_username", "repo_name"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RepoSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_username", nullable = false, length = 100)
    private String ownerUsername;

    @Column(name = "repo_name", nullable = false, length = 255)
    private String repoName;

    @Column(name = "is_public", nullable = false)
    @Builder.Default
    private Boolean isPublic = false;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
