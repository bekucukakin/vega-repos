package com.vega.repos.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Mirrors user-service JSON for people search / profile (no email).
 */
@Data
@NoArgsConstructor
public class UserPublicDto {
    private Long id;
    private String username;
    private String firstName;
    private String lastName;
}
