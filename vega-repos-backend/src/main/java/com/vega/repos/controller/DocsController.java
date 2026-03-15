package com.vega.repos.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/docs")
public class DocsController {

    private static final String DEFAULT_LANG = "en";
    private static final Set<String> SUPPORTED_LANGS = Set.of("en", "tr");

    @Value("${vega.docs.path:#{null}}")
    private String configuredDocsPath;

    private Path resolveDocsRoot() {
        if (configuredDocsPath != null && !configuredDocsPath.isBlank()) {
            Path p = Paths.get(configuredDocsPath);
            if (!p.isAbsolute()) {
                p = Paths.get("").toAbsolutePath().resolve(p).normalize();
            }
            if (isValidDocsRoot(p)) return p;
        }
        Path cwd = Paths.get("").toAbsolutePath();
        String[] relatives = {
            "vegadocs", "../vegadocs", "../../vegadocs",
            "../../../vegadocs", "../../../../vegadocs",
            "../../../../../vegadocs"
        };
        for (String rel : relatives) {
            Path candidate = cwd.resolve(rel).normalize();
            if (isValidDocsRoot(candidate)) return candidate;
        }
        return null;
    }

    private boolean isValidDocsRoot(Path dir) {
        return Files.isDirectory(dir) &&
               (Files.isDirectory(dir.resolve("en")) || Files.isDirectory(dir.resolve("tr")));
    }

    private Path resolveDocsDir(String lang) {
        Path root = resolveDocsRoot();
        if (root == null) return null;

        String safeLang = SUPPORTED_LANGS.contains(lang) ? lang : DEFAULT_LANG;
        Path langDir = root.resolve(safeLang);
        if (Files.isDirectory(langDir)) return langDir;

        Path fallback = root.resolve(DEFAULT_LANG);
        if (Files.isDirectory(fallback)) return fallback;

        return null;
    }

    @GetMapping("/languages")
    public ResponseEntity<List<Map<String, String>>> listLanguages() {
        Path root = resolveDocsRoot();
        List<Map<String, String>> langs = new ArrayList<>();

        if (root != null) {
            if (Files.isDirectory(root.resolve("en"))) {
                langs.add(Map.of("code", "en", "label", "English"));
            }
            if (Files.isDirectory(root.resolve("tr"))) {
                langs.add(Map.of("code", "tr", "label", "Türkçe"));
            }
        }
        return ResponseEntity.ok(langs);
    }

    @GetMapping
    public ResponseEntity<List<Map<String, String>>> listDocs(
            @RequestParam(value = "lang", defaultValue = DEFAULT_LANG) String lang) {
        Path docsDir = resolveDocsDir(lang);
        if (docsDir == null) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        try (Stream<Path> files = Files.list(docsDir)) {
            List<Map<String, String>> docs = files
                    .filter(f -> f.toString().endsWith(".adoc"))
                    .filter(f -> !f.getFileName().toString().equals("index.adoc"))
                    .filter(f -> VISIBLE_DOCS.contains(f.getFileName().toString().replace(".adoc", "")))
                    .sorted(Comparator.comparing(f -> getDocOrder(f.getFileName().toString())))
                    .map(f -> {
                        String filename = f.getFileName().toString();
                        String slug = filename.replace(".adoc", "");
                        String title = extractTitle(f, slug);
                        return Map.of("slug", slug, "title", title, "filename", filename);
                    })
                    .collect(Collectors.toList());
            return ResponseEntity.ok(docs);
        } catch (IOException e) {
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @GetMapping("/{slug}")
    public ResponseEntity<String> getDoc(
            @PathVariable String slug,
            @RequestParam(value = "lang", defaultValue = DEFAULT_LANG) String lang) {
        Path docsDir = resolveDocsDir(lang);
        if (docsDir == null) {
            return ResponseEntity.notFound().build();
        }
        Path file = docsDir.resolve(slug + ".adoc");
        if (!Files.exists(file) || !file.normalize().startsWith(docsDir.normalize())) {
            return ResponseEntity.notFound().build();
        }
        try {
            String content = Files.readString(file);
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(content);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    private String extractTitle(Path file, String fallback) {
        try (Stream<String> lines = Files.lines(file)) {
            Optional<String> titleLine = lines
                    .filter(l -> l.startsWith("= ") && !l.startsWith("=="))
                    .findFirst();
            if (titleLine.isPresent()) {
                return titleLine.get().substring(2).trim();
            }
        } catch (IOException ignored) {}
        return slugToTitle(fallback);
    }

    private String slugToTitle(String slug) {
        return Arrays.stream(slug.split("-"))
                .map(w -> w.substring(0, 1).toUpperCase() + w.substring(1))
                .collect(Collectors.joining(" "));
    }

    private static final Set<String> VISIBLE_DOCS = Set.of(
            "getting-started", "concepts", "workflow", "commands-reference",
            "vega-vcs-core", "ai-features", "troubleshooting");

    private int getDocOrder(String filename) {
        String slug = filename.replace(".adoc", "");
        if (!VISIBLE_DOCS.contains(slug)) return 999;
        return switch (filename) {
            case "getting-started.adoc" -> 1;
            case "concepts.adoc" -> 2;
            case "workflow.adoc" -> 3;
            case "commands-reference.adoc" -> 4;
            case "vega-vcs-core.adoc" -> 5;
            case "ai-features.adoc" -> 6;
            case "troubleshooting.adoc" -> 7;
            default -> 100;
        };
    }
}
