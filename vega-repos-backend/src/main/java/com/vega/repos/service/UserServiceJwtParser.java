package com.vega.repos.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;

/**
 * Parses Vega User Service JWTs locally using the same key material as user-service {@link com.vega.userservice.service.JwtService}:
 * {@code Keys.hmacShaKeyFor(secretKey.getBytes())} (default charset — must match user-service).
 */
@Component
public class UserServiceJwtParser {

    private static final Logger log = LoggerFactory.getLogger(UserServiceJwtParser.class);

    private final Key signingKey;

    public UserServiceJwtParser(
            @Value("${vega.user-service.jwt-secret:}") String secret) {
        if (secret == null || secret.isBlank()) {
            this.signingKey = null;
        } else {
            // Match JwtService#getSignInKey() exactly (not UTF-8 forced).
            byte[] keyBytes = secret.getBytes();
            this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        }
    }

    /**
     * @return JWT subject (username) if signature is valid and token is not expired; otherwise null.
     */
    public String extractUsername(String token) {
        if (signingKey == null || token == null || token.isBlank()) {
            return null;
        }
        try {
            Claims claims = Jwts.parserBuilder()
                    .setSigningKey(signingKey)
                    .build()
                    .parseClaimsJws(token.trim())
                    .getBody();
            String sub = claims.getSubject();
            return sub != null ? sub.trim() : null;
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Could not parse user-service JWT: {}", e.getMessage());
            return null;
        }
    }
}
