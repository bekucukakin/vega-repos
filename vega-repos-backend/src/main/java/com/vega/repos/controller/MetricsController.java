package com.vega.repos.controller;

import com.vega.repos.dto.VegaMetricsDto;
import com.vega.repos.service.MetricsService;
import com.vega.repos.service.RepoAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/metrics")
public class MetricsController {

    private final MetricsService metricsService;
    private final RepoAccessService repoAccessService;

    public MetricsController(MetricsService metricsService, RepoAccessService repoAccessService) {
        this.metricsService = metricsService;
        this.repoAccessService = repoAccessService;
    }

    /** Get metrics for the current user. Requires Auth. */
    @GetMapping("/me")
    public ResponseEntity<VegaMetricsDto> getMyMetrics(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(metricsService.getMetricsForUser(user));
    }

    /** Get global VEGA metrics (all users aggregated). Requires Auth. */
    @GetMapping("/global")
    public ResponseEntity<VegaMetricsDto> getGlobalMetrics(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(metricsService.getGlobalMetrics());
    }

    /**
     * Get metrics for a specific user.
     * Permission: viewer can see their own metrics unconditionally.
     * Viewer can see another user's metrics only if the viewer owns at least one repo
     * where the target is a collaborator (owner/maintainer relationship).
     */
    @GetMapping("/user/{username}")
    public ResponseEntity<VegaMetricsDto> getUserMetrics(
            @PathVariable String username,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        String viewer = repoAccessService.resolveUsername(auth);
        if (viewer == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!repoAccessService.canViewUserMetrics(viewer, username))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(metricsService.getMetricsForUser(username));
    }

    /** Sync commit metrics from CLI. Body: { totalGenerated, acceptedFirst, acceptedAfterRegenerate, rejected, totalRegenerations, totalTimeToAcceptMs } */
    @PostMapping("/commit/sync")
    public ResponseEntity<Void> syncCommitMetrics(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Number> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        long tg = body.containsKey("totalGenerated") ? body.get("totalGenerated").longValue() : 0;
        long af = body.containsKey("acceptedFirst") ? body.get("acceptedFirst").longValue() : 0;
        long aar = body.containsKey("acceptedAfterRegenerate") ? body.get("acceptedAfterRegenerate").longValue() : 0;
        long rej = body.containsKey("rejected") ? body.get("rejected").longValue() : 0;
        long tr = body.containsKey("totalRegenerations") ? body.get("totalRegenerations").longValue() : 0;
        long tta = body.containsKey("totalTimeToAcceptMs") ? body.get("totalTimeToAcceptMs").longValue() : 0;
        metricsService.upsertCommitMetrics(user, tg, af, aar, rej, tr, tta);
        return ResponseEntity.ok().build();
    }

    /** Sync PR review metrics from CLI. Body: { totalPrsAnalyzed, avgReviewTimeWithFeatureMs, avgReviewTimeWithoutFeatureMs } */
    @PostMapping("/pr/sync")
    public ResponseEntity<Void> syncPrMetrics(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Number> body) {
        String user = repoAccessService.resolveUsername(auth);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        long total = body.containsKey("totalPrsAnalyzed") ? body.get("totalPrsAnalyzed").longValue() : 0;
        long avgWith = body.containsKey("avgReviewTimeWithFeatureMs") ? body.get("avgReviewTimeWithFeatureMs").longValue() : 0;
        long avgWithout = body.containsKey("avgReviewTimeWithoutFeatureMs") ? body.get("avgReviewTimeWithoutFeatureMs").longValue() : 0;
        metricsService.upsertPrReviewMetrics(user, total, avgWith, avgWithout);
        return ResponseEntity.ok().build();
    }
}
