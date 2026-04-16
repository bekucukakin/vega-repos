package com.vega.repos.service;

import com.vega.repos.dto.CommitInsightDto;
import com.vega.repos.entity.CommitInsight;
import com.vega.repos.repository.CommitInsightRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class CommitInsightService {

    private final CommitInsightRepository repo;

    public CommitInsightService(CommitInsightRepository repo) {
        this.repo = repo;
    }

    /** Fetch all saved Q&A for a commit, best (most liked) first. */
    public List<CommitInsightDto> getInsights(String ownerUsername, String repoName, String commitHash) {
        return repo.findByOwnerUsernameAndRepoNameAndCommitHashOrderByLikesDescCreatedAtAsc(
                        ownerUsername, repoName, commitHash)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    /** Save a new Q&A insight for the given commit. */
    @Transactional
    public CommitInsightDto saveInsight(String ownerUsername, String repoName,
                                        String commitHash, String question,
                                        String answer, String askedBy) {
        CommitInsight insight = new CommitInsight();
        insight.setOwnerUsername(ownerUsername);
        insight.setRepoName(repoName);
        insight.setCommitHash(commitHash);
        insight.setQuestion(question);
        insight.setAnswer(answer);
        insight.setAskedBy(askedBy);
        insight.setLikes(0);
        return toDto(repo.save(insight));
    }

    /** Increment like count for an insight. Returns updated DTO, or empty if not found. */
    @Transactional
    public Optional<CommitInsightDto> likeInsight(Long insightId) {
        return repo.findById(insightId).map(insight -> {
            insight.setLikes(insight.getLikes() + 1);
            return toDto(repo.save(insight));
        });
    }

    private CommitInsightDto toDto(CommitInsight e) {
        return CommitInsightDto.builder()
                .id(e.getId())
                .commitHash(e.getCommitHash())
                .question(e.getQuestion())
                .answer(e.getAnswer())
                .askedBy(e.getAskedBy())
                .likes(e.getLikes())
                .createdAt(e.getCreatedAt())
                .build();
    }
}
