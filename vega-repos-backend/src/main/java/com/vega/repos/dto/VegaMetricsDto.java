package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * User metrics or global VEGA metrics response.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VegaMetricsDto {
    private String scope;  // "user" or "global"
    private String username;  // null for global
    private CommitMetricsDto commitMetrics;
    private PrMetricsDto prMetrics;
}
