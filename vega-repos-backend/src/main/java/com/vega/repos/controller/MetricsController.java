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
}
