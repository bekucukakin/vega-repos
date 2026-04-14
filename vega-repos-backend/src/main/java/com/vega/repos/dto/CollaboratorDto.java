package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CollaboratorDto {
    private Long id;
    private String username;
    private boolean canCreatePr;
    /** "reader", "developer", "reviewer", or "maintainer" */
    private String role;
}
