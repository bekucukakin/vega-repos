package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrCommentDto {
    private Long id;
    private String author;
    private String content;
    private String filePath;
    private Integer lineNumber;
    private Long parentCommentId;
    private long createdAt;
}
