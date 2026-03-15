package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileTreeNodeDto {
    private String name;
    private String path;
    private String type;  // "file" or "folder"
    private List<FileTreeNodeDto> children;
}
