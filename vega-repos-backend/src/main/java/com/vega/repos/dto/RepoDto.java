package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RepoDto {

    private String name;
    private String path;
    private String owner;
    @Builder.Default
    private Boolean isPublic = false;
    private String description;
}
