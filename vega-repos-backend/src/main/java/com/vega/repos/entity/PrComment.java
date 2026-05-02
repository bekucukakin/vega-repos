package com.vega.repos.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "pr_comments", indexes = {
    @Index(name = "idx_pr_comments_pr", columnList = "ownerUsername,repoName,prId"),
    @Index(name = "idx_pr_comments_parent", columnList = "parentCommentId")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String ownerUsername;

    @Column(nullable = false)
    private String repoName;

    @Column(nullable = false)
    private String prId;

    @Column(nullable = false)
    private String author;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /** null = general PR-level comment */
    private String filePath;

    /** null = general comment, not tied to a specific line */
    private Integer lineNumber;

    /** null = top-level comment */
    private Long parentCommentId;

    @Column(nullable = false)
    private long createdAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean deleted = false;
}
