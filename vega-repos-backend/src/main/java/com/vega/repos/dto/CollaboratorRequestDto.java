package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CollaboratorRequestDto {
    private Long id;
    private String requesterUsername;
    private String ownerUsername;
    private String repoName;
    /** When set: invite from owner. Requester (invitee) must approve. */
    private String invitedByUsername;
    private String status;
    private String message;
    /** Intended role: "reader", "developer", or "reviewer". Defaults to "reader". */
    private String role;
    private Instant createdAt;
}
