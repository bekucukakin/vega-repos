package com.vega.repos.controller;

import com.vega.repos.dto.RepoDto;
import com.vega.repos.dto.UserPublicDto;
import com.vega.repos.service.RepoAccessService;
import com.vega.repos.service.RepoService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

/**
 * People directory: proxies user search to user-service and exposes visible repos per user.
 */
@RestController
@RequestMapping("/api/people")
public class PeopleController {

    private final RestTemplate restTemplate;
    private final RepoAccessService repoAccessService;
    private final RepoService repoService;

    @Value("${vega.user-service.url:http://localhost:8085}")
    private String userServiceUrl;

    public PeopleController(RestTemplate restTemplate,
                            RepoAccessService repoAccessService,
                            RepoService repoService) {
        this.restTemplate = restTemplate;
        this.repoAccessService = repoAccessService;
        this.repoService = repoService;
    }

    @GetMapping("/search")
    public ResponseEntity<List<UserPublicDto>> searchUsers(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(value = "q", defaultValue = "") String q,
            @RequestParam(value = "limit", defaultValue = "30") int limit) {
        String current = repoAccessService.resolveUsername(auth);
        if (current == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        URI uri = UriComponentsBuilder.fromUriString(userServiceUrl + "/api/users/search")
                .queryParam("q", q)
                .queryParam("limit", Math.min(Math.max(limit, 1), 50))
                .encode(StandardCharsets.UTF_8)
                .build()
                .toUri();
        HttpHeaders headers = new HttpHeaders();
        if (auth != null && !auth.isBlank()) {
            headers.set("Authorization", auth.startsWith("Bearer ") ? auth : "Bearer " + auth);
        }
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        try {
            ResponseEntity<List<UserPublicDto>> response = restTemplate.exchange(
                    uri,
                    HttpMethod.GET,
                    entity,
                    new ParameterizedTypeReference<List<UserPublicDto>>() {});
            List<UserPublicDto> body = response.getBody();
            return ResponseEntity.ok(body != null ? body : Collections.emptyList());
        } catch (Exception e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @GetMapping("/{username}/profile")
    public ResponseEntity<UserPublicDto> getProfile(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username) {
        String current = repoAccessService.resolveUsername(auth);
        if (current == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        URI uri = UriComponentsBuilder.fromUriString(userServiceUrl + "/api/users/by-username/{username}")
                .encode(StandardCharsets.UTF_8)
                .buildAndExpand(username)
                .toUri();
        HttpHeaders headers = new HttpHeaders();
        if (auth != null && !auth.isBlank()) {
            headers.set("Authorization", auth.startsWith("Bearer ") ? auth : "Bearer " + auth);
        }
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        try {
            ResponseEntity<UserPublicDto> response = restTemplate.exchange(
                    uri,
                    HttpMethod.GET,
                    entity,
                    UserPublicDto.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{username}/repos")
    public ResponseEntity<List<RepoDto>> listVisibleRepos(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String username) {
        String current = repoAccessService.resolveUsername(auth);
        if (current == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(repoService.listRepositoriesVisibleToViewer(username, current));
    }
}
