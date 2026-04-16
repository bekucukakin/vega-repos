package com.vega.repos.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Stores community-sourced Q&A about a specific commit.
 * Users can ask questions via the AI panel; any answer they find valuable
 * can be liked. High-liked answers surface automatically for the next visitor.
 */
@Entity
@Table(name = "commit_insights", indexes = {
    @Index(name = "idx_ci_repo_hash", columnList = "owner_username, repo_name, commit_hash")
})
public class CommitInsight {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_username", nullable = false, length = 100)
    private String ownerUsername;

    @Column(name = "repo_name", nullable = false, length = 255)
    private String repoName;

    @Column(name = "commit_hash", nullable = false, length = 40)
    private String commitHash;

    /** The question the user asked. */
    @Column(name = "question", nullable = false, length = 1000)
    private String question;

    /** The AI-generated answer. */
    @Column(name = "answer", nullable = false, columnDefinition = "TEXT")
    private String answer;

    /** Username of whoever originally asked this. */
    @Column(name = "asked_by", nullable = false, length = 100)
    private String askedBy;

    /** Cumulative like count — drives "best answer" ranking. */
    @Column(name = "likes", nullable = false)
    private int likes = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    // ── Getters & setters ──────────────────────────────────────────────

    public Long getId() { return id; }

    public String getOwnerUsername() { return ownerUsername; }
    public void setOwnerUsername(String ownerUsername) { this.ownerUsername = ownerUsername; }

    public String getRepoName() { return repoName; }
    public void setRepoName(String repoName) { this.repoName = repoName; }

    public String getCommitHash() { return commitHash; }
    public void setCommitHash(String commitHash) { this.commitHash = commitHash; }

    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }

    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }

    public String getAskedBy() { return askedBy; }
    public void setAskedBy(String askedBy) { this.askedBy = askedBy; }

    public int getLikes() { return likes; }
    public void setLikes(int likes) { this.likes = likes; }

    public Instant getCreatedAt() { return createdAt; }
}
