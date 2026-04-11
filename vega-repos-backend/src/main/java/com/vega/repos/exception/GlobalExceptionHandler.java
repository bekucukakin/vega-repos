package com.vega.repos.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Locale;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String GENERIC_DATA_ERROR =
            "Something went wrong while loading data. Please refresh the page. If it continues, run a full Docker reset from the project start script.";

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntimeException(RuntimeException ex) {
        String raw = ex.getMessage() != null ? ex.getMessage() : "Unexpected error";
        if (shouldSanitizeForClient(raw)) {
            log.error("RuntimeException (sanitized for client): {}", raw);
            log.debug("Full stack", ex);
            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", GENERIC_DATA_ERROR));
        }
        log.warn("RuntimeException: {}", raw);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", raw));
    }

    /** Never send JDBC/SQL/Hibernate details to the browser. */
    static boolean shouldSanitizeForClient(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        String s = raw.toLowerCase(Locale.ROOT);
        if (s.contains("jdbc") || s.contains("hibernate") || s.contains("sql") || s.contains("preparedstatement")) {
            return true;
        }
        if (s.contains("could not prepare statement") || s.contains("could not execute statement")) {
            return true;
        }
        if (raw.contains("[421") || raw.contains("[235")) {
            return true;
        }
        if (s.contains("repo_collaborator") || s.contains("column \"") || s.contains("column '")) {
            return true;
        }
        return s.contains("select ") && s.contains(" from ");
    }
}
