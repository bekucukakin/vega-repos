package com.vega.repos.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class RepoDownloadService {

    private static final Logger log = LoggerFactory.getLogger(RepoDownloadService.class);

    private final RestTemplate restTemplate;

    @Value("${vega.pull-service.url:http://localhost:8083}")
    private String pullServiceUrl;

    public RepoDownloadService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public byte[] downloadAsZip(String token, String username, String repoName) {
        String repositoryId = username + "/" + repoName;
        String url = pullServiceUrl + "/api/pull/repository";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", token.startsWith("Bearer ") ? token : "Bearer " + token);

        Map<String, Object> body = Map.of(
                "repositoryId", repositoryId,
                "forcePull", false
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                entity,
                new ParameterizedTypeReference<Map<String, Object>>() {}
        );

        if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            throw new RuntimeException("Failed to fetch repository from Pull Service");
        }

        Map<String, Object> pullResponse = response.getBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> files = (List<Map<String, Object>>) pullResponse.get("files");
        if (files == null || files.isEmpty()) {
            throw new RuntimeException("Repository has no files to download");
        }

        return buildZip(files, repoName);
    }

    private byte[] buildZip(List<Map<String, Object>> files, String repoName) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
             ZipOutputStream zos = new ZipOutputStream(baos)) {

            for (Map<String, Object> file : files) {
                String path = (String) file.get("path");
                String contentB64 = (String) file.get("content");
                if (path == null || contentB64 == null) continue;

                String entryPath = repoName + "/" + path;
                ZipEntry entry = new ZipEntry(entryPath);
                zos.putNextEntry(entry);

                byte[] decoded = Base64.getDecoder().decode(contentB64);
                zos.write(decoded);
                zos.closeEntry();
            }

            zos.finish();
            return baos.toByteArray();
        } catch (Exception e) {
            log.error("Failed to build zip", e);
            throw new RuntimeException("Failed to create download archive: " + e.getMessage());
        }
    }
}
