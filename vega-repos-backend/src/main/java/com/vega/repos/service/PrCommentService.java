package com.vega.repos.service;

import com.vega.repos.dto.PrCommentDto;
import com.vega.repos.entity.PrComment;
import com.vega.repos.repository.PrCommentRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class PrCommentService {

    private final PrCommentRepository repo;

    public PrCommentService(PrCommentRepository repo) {
        this.repo = repo;
    }

    public List<PrCommentDto> getComments(String ownerUsername, String repoName, String prId) {
        return repo.findByOwnerUsernameAndRepoNameAndPrIdAndDeletedFalseOrderByCreatedAtAsc(
                ownerUsername, repoName, prId)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public PrCommentDto addComment(String ownerUsername, String repoName, String prId,
                                   String author, String content,
                                   String filePath, Integer lineNumber, Long parentCommentId) {
        PrComment c = PrComment.builder()
                .ownerUsername(ownerUsername)
                .repoName(repoName)
                .prId(prId)
                .author(author)
                .content(content.strip())
                .filePath(filePath)
                .lineNumber(lineNumber)
                .parentCommentId(parentCommentId)
                .createdAt(System.currentTimeMillis())
                .build();
        return toDto(repo.save(c));
    }

    public boolean deleteComment(Long commentId, String requestingUser) {
        return repo.findById(commentId).map(c -> {
            if (!c.getAuthor().equals(requestingUser)) return false;
            c.setDeleted(true);
            repo.save(c);
            return true;
        }).orElse(false);
    }

    private PrCommentDto toDto(PrComment c) {
        return PrCommentDto.builder()
                .id(c.getId())
                .author(c.getAuthor())
                .content(c.getContent())
                .filePath(c.getFilePath())
                .lineNumber(c.getLineNumber())
                .parentCommentId(c.getParentCommentId())
                .createdAt(c.getCreatedAt())
                .build();
    }
}
