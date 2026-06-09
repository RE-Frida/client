import { useState, useEffect, useCallback } from "react";
import {
  Search, Download, User, Plus, Trash2, FolderOpen, Package,
  X, Tag, ChevronRight, FileCode, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listProjects, createProject, deleteProject, downloadProject,
  listProjectFiles, getProjectFile, getAuthState,
} from "@/hooks/tauri";
import type { ProjectData, AuthState } from "@/types";

interface MarketplaceProps {
  onUseScript: (code: string) => void;
}

const CATEGORIES = ["All", "Tools", "Games", "Security", "Utilities", "Other"];

export function Marketplace({ onUseScript }: MarketplaceProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIcon, setCreateIcon] = useState("");
  const [createCategory, setCreateCategory] = useState("Tools");
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProjects();
      setProjects(result);
    } catch (e) {
      console.error("Failed to fetch projects:", e);
    } finally {
      setLoading(false);
    }
  }, []);

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
    return matchesSearch && matchesCategory;
  });

  const handleSelectProject = async (project: ProjectData) => {
    setSelectedProject(project);
    setSelectedFile(null);
    setFileContent(null);
    setLoadingFiles(true);
    try {
      const files = await listProjectFiles(project.id);
      setProjectFiles(files);
    } catch (e) {
      console.error("Failed to list project files:", e);
      setProjectFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSelectFile = async (path: string) => {
    if (!selectedProject) return;
    setSelectedFile(path);
    setFileContent(null);
    setLoadingContent(true);
    try {
      const content = await getProjectFile(selectedProject.id, path);
      setFileContent(content);
    } catch (e) {
      console.error("Failed to get file content:", e);
      setFileContent("// Failed to load file");
    } finally {
      setLoadingContent(false);
    }
  };

  const handleUseProject = async (project: ProjectData) => {
    setDownloading(project.id);
    try {
      await downloadProject(project.id);
      const files = await listProjectFiles(project.id);
      if (files.length > 0) {
        const mainFile = files.find((f) => f === "main.js") || files.find((f) => f.endsWith(".js")) || files[0];
        const content = await getProjectFile(project.id, mainFile);
        onUseScript(content);
      }
    } catch (e) {
      console.error("Failed to download project:", e);
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (project: ProjectData) => {
    try {
      await deleteProject(project.id);
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
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
    setCreating(true);
    try {
      const tags = createTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await createProject(createName, createDescription, createIcon, createCategory, tags);
      setShowCreateDialog(false);
      setCreateName("");
      setCreateDescription("");
      setCreateIcon("");
      setCreateCategory("Tools");
      setCreateTags("");
      await fetchProjects();
    } catch (e) {
      console.error("Failed to create project:", e);
    } finally {
      setCreating(false);
    }
  };

  const isOwner = (project: ProjectData) => {
    if (!auth?.authenticated || !auth.username) return false;
    return project.author === auth.username;
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
      </div>

      {!auth?.authenticated && (
        <Card className="border-warning">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Login with Discord to create and manage projects
          </CardContent>
        </Card>
      )}

      <div className="grid flex-1 grid-cols-3 gap-4 overflow-hidden">
        <ScrollArea className="col-span-2">
          <div className="space-y-3 pr-4">
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
              filtered.map((project) => (
                <Card
                  key={project.id}
                  className={
                    "cursor-pointer transition-colors hover:border-primary/50 " +
                    (selectedProject?.id === project.id ? "border-primary" : "")
                  }
                  onClick={() => handleSelectProject(project)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg">
                          {project.icon || "📦"}
                        </div>
                        <div>
                          <CardTitle className="text-base">{project.name}</CardTitle>
                          <CardDescription className="mt-1 line-clamp-2">
                            {project.description}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary">{project.category}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
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
                        <div className="flex gap-1">
                          {project.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseProject(project);
                          }}
                          disabled={downloading === project.id}
                        >
                          {downloading === project.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="mr-1 h-3 w-3" />
                          )}
                          Use
                        </Button>
                        {isOwner(project) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(project);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>

        <Card className="col-span-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedProject ? selectedProject.name : "Project Files"}
            </CardTitle>
            <CardDescription>
              {selectedProject ? selectedProject.description : "Select a project to view files"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
            {selectedProject ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  {selectedProject.author}
                  <Download className="ml-2 h-3 w-3" />
                  {selectedProject.downloads.toLocaleString()} downloads
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleUseProject(selectedProject)}
                    disabled={downloading === selectedProject.id}
                  >
                    {downloading === selectedProject.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3 w-3" />
                    )}
                    Use Project
                  </Button>
                  {isOwner(selectedProject) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(selectedProject)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  Files
                  <ChevronRight className="h-3 w-3" />
                  {selectedFile && <span className="text-foreground">{selectedFile}</span>}
                </div>
                {loadingFiles ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <ScrollArea className="flex-1">
                    <div className="space-y-1 pr-2">
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
                          No files in this project
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                )}
                {selectedFile && (
                  <div className="mt-1">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Preview: {selectedFile}
                    </div>
                    {loadingContent ? (
                      <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs font-mono">
                        {fileContent}
                      </pre>
                    )}
                    <Button
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => {
                        if (fileContent) onUseScript(fileContent);
                      }}
                    >
                      Use This File
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <p className="text-sm">Select a project to view files</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Create Project</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowCreateDialog(false)}
                >
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
                <label className="text-sm font-medium">Icon (emoji)</label>
                <Input
                  placeholder="📦"
                  value={createIcon}
                  onChange={(e) => setCreateIcon(e.target.value)}
                  className="w-20"
                />
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
                <label className="text-sm font-medium">Tags (comma-separated)</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="frida, hooking, android"
                    value={createTags}
                    onChange={(e) => setCreateTags(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!createName.trim() || creating}>
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
