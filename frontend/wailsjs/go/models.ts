export namespace models {
	
	export class HotkeyBinding {
	    id: string;
	    action: string;
	    label: string;
	    key: string;
	    ctrl: boolean;
	    alt: boolean;
	    shift: boolean;
	    meta: boolean;
	    enabled: boolean;
	    category: string;
	
	    static createFrom(source: any = {}) {
	        return new HotkeyBinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.action = source["action"];
	        this.label = source["label"];
	        this.key = source["key"];
	        this.ctrl = source["ctrl"];
	        this.alt = source["alt"];
	        this.shift = source["shift"];
	        this.meta = source["meta"];
	        this.enabled = source["enabled"];
	        this.category = source["category"];
	    }
	}
	export class RecentDocument {
	    path: string;
	    name: string;
	    type: string;
	    lastOpenedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentDocument(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.lastOpenedAt = source["lastOpenedAt"];
	    }
	}
	export class WorkspaceSessionState {
	    openTabPaths: string[];
	    activeTabPath: string;
	    collapsedFolderPaths: string[];
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceSessionState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.openTabPaths = source["openTabPaths"];
	        this.activeTabPath = source["activeTabPath"];
	        this.collapsedFolderPaths = source["collapsedFolderPaths"];
	    }
	}
	export class AppConfig {
	    theme: string;
	    autoSave: boolean;
	    autoSaveDelay: number;
	    showSidebar: boolean;
	    showOutline: boolean;
	    editorMode: string;
	    workspacePath: string;
	    openTabPaths: string[];
	    activeTabPath: string;
	    collapsedFolderPaths: string[];
	    workspaceStates: Record<string, WorkspaceSessionState>;
	    recentDocuments: RecentDocument[];
	    hotkeys: HotkeyBinding[];
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.autoSave = source["autoSave"];
	        this.autoSaveDelay = source["autoSaveDelay"];
	        this.showSidebar = source["showSidebar"];
	        this.showOutline = source["showOutline"];
	        this.editorMode = source["editorMode"];
	        this.workspacePath = source["workspacePath"];
	        this.openTabPaths = source["openTabPaths"];
	        this.activeTabPath = source["activeTabPath"];
	        this.collapsedFolderPaths = source["collapsedFolderPaths"];
	        this.workspaceStates = this.convertValues(source["workspaceStates"], WorkspaceSessionState, true);
	        this.recentDocuments = this.convertValues(source["recentDocuments"], RecentDocument);
	        this.hotkeys = this.convertValues(source["hotkeys"], HotkeyBinding);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DocumentMeta {
	    title: string;
	    content: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new DocumentMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.content = source["content"];
	        this.path = source["path"];
	    }
	}
	export class DocumentPayload {
	    path: string;
	    name: string;
	    content: string;
	    exists: boolean;
	    lastModified: string;
	
	    static createFrom(source: any = {}) {
	        return new DocumentPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.content = source["content"];
	        this.exists = source["exists"];
	        this.lastModified = source["lastModified"];
	    }
	}
	export class ExportPayload {
	    title: string;
	    html: string;
	    sourcePath: string;
	
	    static createFrom(source: any = {}) {
	        return new ExportPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.html = source["html"];
	        this.sourcePath = source["sourcePath"];
	    }
	}
	export class ExportPdfPayload {
	    title: string;
	    html: string;
	    sourcePath: string;
	
	    static createFrom(source: any = {}) {
	        return new ExportPdfPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.html = source["html"];
	        this.sourcePath = source["sourcePath"];
	    }
	}
	
	
	export class SaveImageResult {
	    path: string;
	    relativePath: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveImageResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.relativePath = source["relativePath"];
	    }
	}
	export class SaveResult {
	    path: string;
	    name: string;
	    savedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.savedAt = source["savedAt"];
	    }
	}
	export class WorkspaceFile {
	    path: string;
	    name: string;
	    relativePath: string;
	    depth: number;
	    size: number;
	    modifiedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.relativePath = source["relativePath"];
	        this.depth = source["depth"];
	        this.size = source["size"];
	        this.modifiedAt = source["modifiedAt"];
	    }
	}
	export class Workspace {
	    rootPath: string;
	    name: string;
	    files: WorkspaceFile[];
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rootPath = source["rootPath"];
	        this.name = source["name"];
	        this.files = this.convertValues(source["files"], WorkspaceFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WorkspaceSearchResult {
	    path: string;
	    name: string;
	    relativePath: string;
	    line: number;
	    column: number;
	    snippet: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceSearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.relativePath = source["relativePath"];
	        this.line = source["line"];
	        this.column = source["column"];
	        this.snippet = source["snippet"];
	    }
	}

}

