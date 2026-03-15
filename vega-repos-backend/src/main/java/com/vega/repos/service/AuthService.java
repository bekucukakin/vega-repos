package com.vega.repos.service;

import com.vega.repos.dto.AuthResponseDto;
import com.vega.repos.dto.LoginRequest;
import com.vega.repos.dto.RegisterRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

@Service
public class AuthService {

    private final RestTemplate restTemplate;

    @Value("${vega.user-service.url}")
    private String userServiceUrl;

    @Value("${vega.user-service.login-path:/api/auth/login}")
    private String loginPath;

    public AuthService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public AuthResponseDto login(LoginRequest request) {
        String url = userServiceUrl + loginPath;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<LoginRequest> entity = new HttpEntity<>(request, headers);

        try {
            ResponseEntity<AuthResponseDto> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    AuthResponseDto.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                AuthResponseDto body = response.getBody();
                if (body.getType() == null) {
                    body = AuthResponseDto.builder()
                            .token(body.getToken())
                            .type("Bearer")
                            .userId(body.getUserId())
                            .username(body.getUsername())
                            .email(body.getEmail())
                            .role(body.getRole())
                            .expiresIn(body.getExpiresIn())
                            .build();
                }
                return body;
            }
        } catch (HttpClientErrorException e) {
            String body = e.getResponseBodyAsString();
            String message = parseErrorMessage(body);
            throw new RuntimeException(message != null ? message : "Invalid username or password.");
        }
        throw new RuntimeException("Login failed: Invalid response from user service");
    }

    public AuthResponseDto register(RegisterRequest request) {
        String url = userServiceUrl + "/api/auth/register";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<RegisterRequest> entity = new HttpEntity<>(request, headers);

        try {
            ResponseEntity<AuthResponseDto> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    AuthResponseDto.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                AuthResponseDto body = response.getBody();
                if (body.getType() == null) {
                    body = AuthResponseDto.builder()
                            .token(body.getToken())
                            .type("Bearer")
                            .userId(body.getUserId())
                            .username(body.getUsername())
                            .email(body.getEmail())
                            .role(body.getRole())
                            .expiresIn(body.getExpiresIn())
                            .build();
                }
                return body;
            }
        } catch (HttpClientErrorException e) {
            String body = e.getResponseBodyAsString();
            String message = parseErrorMessage(body);
            throw new RuntimeException(message != null ? message : "Registration failed.");
        }
        throw new RuntimeException("Registration failed: Invalid response from user service");
    }

    private static String parseErrorMessage(String body) {
        if (body == null || body.isBlank()) return null;
        try {
            JsonNode n = new ObjectMapper().readTree(body);
            if (n.has("message")) return n.get("message").asText();
            if (n.has("error")) return n.get("error").asText();
            if (n.has("reason")) return n.get("reason").asText();
        } catch (Exception ignored) { }
        return null;
    }
}
