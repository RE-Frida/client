import { useState, useEffect, useCallback } from "react";
import {
  Search, Download, User, Plus, Trash2, Package,
  X, Tag, FileCode, Loader2, CheckCircle2, ChevronDown, ChevronUp,
  Image, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  listProjects, createProject, deleteProject, downloadProject,
  listProjectFiles, getProjectFile, getAuthState,
  isProjectInstalled, getProjectDiff, updateProjectFromServer,
  getProjectInstallPath,
} from "@/hooks/tauri";
import type { ProjectData, AuthState } from "@/types";

interface MarketplaceProps {
  onUseProject: (projectId: string) => void;
}

const CATEGORIES = ["All", "Tools", "Games", "Security", "Utilities", "Other"];

export function Marketplace({ onUseProject }: MarketplaceProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIcon, setCreateIcon] = useState("");
  const [createIconPreview, setCreateIconPreview] = useState<string | null>(null);
  const [createCategory, setCreateCategory] = useState("Tools");
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [showInstalled, setShowInstalled] = useState(false);
  const [diffMap, setDiffMap] = useState<Map<string, boolean>>(new Map());

  const checkInstalled = useCallback(async (projects: ProjectData[]) => {
    const result = new Set<string>();
    for (const p of projects) {
      try {
        if (await isProjectInstalled(p.id)) result.add(p.id);
      } catch {}
    }
    setInstalled(result);
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProjects();
      setProjects(result);
      checkInstalled(result);
    } catch (e) {
      console.error("Failed to fetch projects:", e);
    } finally {
      setLoading(false);
    }
  }, [checkInstalled]);

  useEffect(() => {
    getAuthState().then(setAuth).catch(() => {});
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = projects.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.author.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = category === "All" || p.category === category;
    const matchesInstalled = !showInstalled || installed.has(p.id);
    return matchesSearch && matchesCategory && matchesInstalled;
  });

  const handleToggleExpand = async (project: ProjectData) => {
    if (expandedId === project.id) {
      setExpandedId(null);
      setProjectFiles([]);
      setSelectedFile(null);
      setFileContent(null);
      return;
    }
    setExpandedId(project.id);
    setSelectedFile(null);
    setFileContent(null);
    setLoadingFiles(true);
    try {
      const files = await listProjectFiles(project.id);
      setProjectFiles(files);

      // Check if installed and check diff
      if (installed.has(project.id)) {
        try {
          const path = await getProjectInstallPath(project.id);
          const d = await getProjectDiff(project.id, path);
          const hasDiff = d.serverOnly.length > 0 || d.different.length > 0;
          setDiffMap((prev) => new Map(prev).set(project.id, hasDiff));
        } catch {
          setDiffMap((prev) => new Map(prev).set(project.id, true));
        }
      }
    } catch (e) {
      console.error("Failed to list project files:", e);
      setProjectFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSelectFile = async (path: string) => {
    if (!expandedId) return;
    setSelectedFile(path);
    setFileContent(null);
    setLoadingContent(true);
    try {
      const content = await getProjectFile(expandedId, path);
      setFileContent(content);
    } catch (e) {
      console.error("Failed to get file content:", e);
      setFileContent("// Failed to load file");
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDownload = async (project: ProjectData) => {
    setDownloading(project.id);
    try {
      await downloadProject(project.id);
      setInstalled((prev) => new Set(prev).add(project.id));
      setDiffMap((prev) => new Map(prev).set(project.id, false));
    } catch (e) {
      console.error("Failed to download project:", e);
    } finally {
      setDownloading(null);
    }
  };

  const handleUpdate = async (project: ProjectData) => {
    setUpdating(project.id);
    try {
      const path = await getProjectInstallPath(project.id);
      await updateProjectFromServer(project.id, path);
      setDiffMap((prev) => new Map(prev).set(project.id, false));
    } catch (e) {
      console.error("Failed to update project:", e);
    } finally {
      setUpdating(null);
    }
  };

  const handleUse = (project: ProjectData) => {
    onUseProject(project.id);
  };

  const handleDelete = async (project: ProjectData) => {
    try {
      await deleteProject(project.id);
      if (expandedId === project.id) {
        setExpandedId(null);
        setProjectFiles([]);
        setSelectedFile(null);
        setFileContent(null);
      }
      await fetchProjects();
    } catch (e) {
      console.error("Failed to delete project:", e);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    const tags = createTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 10) return;
    setCreating(true);
    try {
      await createProject(createName, createDescription, createIcon, createCategory, tags);
      setShowCreateDialog(false);
      setCreateName("");
      setCreateDescription("");
      setCreateIcon("");
      setCreateIconPreview(null);
      setCreateCategory("Tools");
      setCreateTags("");
      await fetchProjects();
    } catch (e) {
      console.error("Failed to create project:", e);
    } finally {
      setCreating(false);
    }
  };

  const handlePickIcon = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (selected) {
        const bytes = await readFile(selected);
        const binary = String.fromCharCode(...bytes);
        const base64 = btoa(binary);
        const ext = selected.split(".").pop()?.toLowerCase() || "png";
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
        const dataUrl = `data:${mime};base64,${base64}`;
        setCreateIcon(dataUrl);
        setCreateIconPreview(dataUrl);
      }
    } catch (e) {
      console.error("Failed to pick icon:", e);
    }
  };

  const isOwner = (project: ProjectData) => {
    if (!auth?.authenticated || !auth.username) return false;
    return project.author === auth.username;
  };

  const tagsCount = createTags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean).length;

  const renderProjectActions = (project: ProjectData) => {
    const isInstalled = installed.has(project.id);
    const needsUpdate = diffMap.get(project.id);

    if (!isInstalled) {
      return (
        <Button
          size="sm"
          onClick={() => handleDownload(project)}
          disabled={downloading === project.id}
        >
          {downloading === project.id ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Download className="mr-1 h-3 w-3" />
          )}
          Download
        </Button>
      );
    }

    if (needsUpdate) {
      return (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleUpdate(project)}
            disabled={updating === project.id}
          >
            {updating === project.id ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Download className="mr-1 h-3 w-3" />
            )}
            Update
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleUse(project)}>
            Use
          </Button>
        </div>
      );
    }

    return (
      <Button size="sm" onClick={() => handleUse(project)}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Use
      </Button>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Projects</h2>
          <p className="text-sm text-muted-foreground">Browse and use community projects</p>
        </div>
        {auth?.authenticated && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
        <Button
          variant={showInstalled ? "default" : "outline"}
          size="sm"
          onClick={() => setShowInstalled(!showInstalled)}
          className="gap-1.5"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Installed
        </Button>
      </div>

      {!auth?.authenticated && (
        <Card className="border-warning">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Login with Discord to create and manage projects
          </CardContent>
        </Card>
      )}

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading projects...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Package className="mr-2 h-4 w-4" />
              No projects found
            </div>
          ) : (
            filtered.map((project) => {
              const isExpanded = expandedId === project.id;
              return (
                <div key={project.id}>
                  <Card
                    className={
                      "cursor-pointer transition-colors hover:border-primary/50 " +
                      (isExpanded ? "border-primary rounded-b-none" : "")
                    }
                    onClick={() => handleToggleExpand(project)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted overflow-hidden">
                            {project.icon ? (
                              <img
                                src={project.icon}
                                alt={project.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                                }}
                              />
                            ) : null}
                            <span className={project.icon ? "hidden" : "text-lg"}>📦</span>
                          </div>
                          <div>
                            <CardTitle className="text-base">{project.name}</CardTitle>
                            <CardDescription className="mt-0.5 line-clamp-2">
                              {project.description}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary">{project.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {project.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {project.downloads.toLocaleString()}
                          </span>
                          {installed.has(project.id) && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Installed
                            </Badge>
                          )}
                          <div className="flex gap-1">
                            {project.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <Card className="border-primary/50 rounded-t-none border-t-0">
                      <CardContent className="pt-4">
                        <div className="flex gap-6">
                          {/* Icon */}
                          {project.icon && (
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden">
                              <img
                                src={project.icon}
                                alt={project.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            </div>
                          )}

                          {/* Details */}
                          <div className="flex flex-1 flex-col gap-3">
                            <p className="text-sm text-muted-foreground">{project.description}</p>

                            {/* Tags */}
                            {project.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {project.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-2">
                              {renderProjectActions(project)}
                              {isOwner(project) && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(project)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Files section */}
                        <div className="mt-4">
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <FileCode className="h-3 w-3" />
                            Files
                          </h4>
                          {loadingFiles ? (
                            <div className="flex items-center justify-center py-4 text-muted-foreground">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            </div>
                          ) : (
                            <div className="flex gap-4">
                              <div className="w-48 shrink-0 space-y-0.5">
                                {projectFiles.map((file) => (
                                  <button
                                    key={file}
                                    className={
                                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors " +
                                      (selectedFile === file
                                        ? "bg-primary/10 text-primary"
                                        : "hover:bg-muted text-muted-foreground hover:text-foreground")
                                    }
                                    onClick={() => handleSelectFile(file)}
                                  >
                                    <FileCode className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{file}</span>
                                  </button>
                                ))}
                                {projectFiles.length === 0 && (
                                  <p className="py-2 text-center text-xs text-muted-foreground">
                                    No files
                                  </p>
                                )}
                              </div>

                              {/* File preview */}
                              {selectedFile && (
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-muted-foreground mb-1">
                                    {selectedFile}
                                  </div>
                                  {loadingContent ? (
                                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    </div>
                                  ) : (
                                    <pre className="max-h-60 overflow-auto rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                                      {fileContent}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create Project</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowCreateDialog(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>Create a new project to share with the community</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="My Project"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="A short description of your project"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Icon</label>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={handlePickIcon}>
                    <Image className="mr-1.5 h-4 w-4" />
                    Choose Image
                  </Button>
                  {createIconPreview && (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted overflow-hidden">
                      <img src={createIconPreview} alt="icon" className="h-full w-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.filter((c) => c !== "All").map((cat) => (
                    <Button
                      key={cat}
                      variant={createCategory === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCreateCategory(cat)}
                      type="button"
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <span>Tags (comma-separated)</span>
                  <span className="text-[10px] text-muted-foreground">
                    {tagsCount}/10
                  </span>
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="frida, hooking, android"
                    value={createTags}
                    onChange={(e) => {
                      const val = e.target.value;
                      const currentTags = val.split(",").map((t) => t.trim()).filter(Boolean);
                      if (currentTags.length <= 10) {
                        setCreateTags(val);
                      }
                    }}
                    className="pl-9"
                  />
                </div>
                {tagsCount >= 10 && (
                  <p className="text-[10px] text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Maximum 10 tags
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!createName.trim() || creating || tagsCount > 10}
                >
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
