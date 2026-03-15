package com.vega.repos.controller;

import com.vega.repos.dto.AuthResponseDto;
import com.vega.repos.dto.LoginRequest;
import com.vega.repos.dto.RegisterRequest;
import com.vega.repos.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService authService;
    private final RestTemplate restTemplate;

    @Value("${vega.user-service.url}")
    private String userServiceUrl;

    public AuthController(AuthService authService, RestTemplate restTemplate) {
        this.authService = authService;
        this.restTemplate = restTemplate;
    }

    @PostMapping("/auth/login")
    public ResponseEntity<AuthResponseDto> login(@Valid @RequestBody LoginRequest request) {
        AuthResponseDto response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/auth/register")
    public ResponseEntity<AuthResponseDto> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponseDto response = authService.register(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/users/profile")
    public ResponseEntity<?> getProfile(@RequestHeader(value = "Authorization", required = false) String auth) {
        if (auth == null || auth.isBlank()) return ResponseEntity.status(401).build();
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", auth);
            ResponseEntity<String> res = restTemplate.exchange(
                    userServiceUrl + "/api/users/profile",
                    HttpMethod.GET, new HttpEntity<>(headers), String.class);
            return ResponseEntity.status(res.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(res.getBody());
        } catch (HttpClientErrorException e) {
            return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString());
        }
    }

    @PutMapping("/users/profile")
    public ResponseEntity<?> updateProfile(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody String body) {
        if (auth == null || auth.isBlank()) return ResponseEntity.status(401).build();
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", auth);
            headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<String> res = restTemplate.exchange(
                    userServiceUrl + "/api/users/profile",
                    HttpMethod.PUT, new HttpEntity<>(body, headers), String.class);
            return ResponseEntity.status(res.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(res.getBody());
        } catch (HttpClientErrorException e) {
            return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString());
        }
    }

    @PostMapping("/users/change-password")
    public ResponseEntity<?> changePassword(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody String body) {
        if (auth == null || auth.isBlank()) return ResponseEntity.status(401).build();
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", auth);
            headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<String> res = restTemplate.exchange(
                    userServiceUrl + "/api/users/change-password",
                    HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
            return ResponseEntity.status(res.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(res.getBody());
        } catch (HttpClientErrorException e) {
            return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAsString());
        }
    }
}
