/**
 * Matterport API Service
 * 
 * Server-side service that communicates with the Matterport GraphQL API.
 * All Matterport API tokens are stored securely on the server – never exposed to the client.
 * 
 * Architecture:
 *   Flutter/Expo App → protoKI Backend → Matterport API → (later: OpenAI Vision → Reports)
 * 
 * API Endpoint: https://api.matterport.com/api/models/graph
 * Auth: Basic Auth with Token ID:Token Secret (base64 encoded)
 */

import axios from "axios";

const MATTERPORT_API_URL = "https://api.matterport.com/api/models/graph";

// Types for Matterport data structures
export interface MatterportCredentials {
  tokenId: string;
  tokenSecret: string;
}

export interface MatterportModel {
  id: string;
  name: string;
  description?: string;
  created: string;
  modified: string;
  visibility: string;
  address?: {
    streetAddressLines?: string;
    locality?: string;
    administrativeArea?: string;
    countryName?: string;
    postalCode?: string;
  };
  assets?: {
    panos?: { count: number };
    photos?: { count: number };
    meshes?: { count: number };
  };
  floors?: {
    id: string;
    label: string;
    sequence: number;
  }[];
  rooms?: {
    id: string;
    label: string;
    floor?: { id: string; label: string };
  }[];
  mattertags?: {
    id: string;
    label: string;
    description?: string;
    mediaType?: string;
    position?: { x: number; y: number; z: number };
  }[];
  sweeps?: {
    id: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    floor?: { id: string };
  }[];
}

export interface MatterportModelSummary {
  id: string;
  name: string;
  description?: string;
  created: string;
  modified: string;
  visibility: string;
  address?: {
    locality?: string;
    administrativeArea?: string;
    countryName?: string;
  };
}

export interface MatterportSearchResult {
  totalResults: number;
  nextOffset?: string;
  results: MatterportModelSummary[];
}

/**
 * Build the Basic Auth header from Matterport credentials
 */
function buildAuthHeader(credentials: MatterportCredentials): string {
  const encoded = Buffer.from(`${credentials.tokenId}:${credentials.tokenSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Execute a GraphQL query against the Matterport Model API
 */
async function executeGraphQL(
  credentials: MatterportCredentials,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  const response = await axios.post(
    MATTERPORT_API_URL,
    { query, variables },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(credentials),
      },
      timeout: 30000,
    }
  );

  if (response.data.errors) {
    const errorMsg = response.data.errors.map((e: any) => e.message).join("; ");
    throw new Error(`Matterport API Error: ${errorMsg}`);
  }

  return response.data.data;
}

/**
 * Verify Matterport credentials by making a simple query
 */
export async function verifyCredentials(credentials: MatterportCredentials): Promise<boolean> {
  try {
    const query = `query { models(pageSize: 1) { totalResults } }`;
    await executeGraphQL(credentials, query);
    return true;
  } catch (error: any) {
    if (error.response?.status === 401) return false;
    throw error;
  }
}

/**
 * List all models in the Matterport account
 */
export async function listModels(
  credentials: MatterportCredentials,
  options?: { pageSize?: number; offset?: string; query?: string }
): Promise<MatterportSearchResult> {
  const pageSize = options?.pageSize || 50;
  const offset = options?.offset ? `"${options.offset}"` : "null";
  const searchQuery = options?.query ? `"${options.query}"` : '"*"';

  const query = `
    query {
      models(pageSize: ${pageSize}, offset: ${offset}, query: ${searchQuery}) {
        totalResults
        nextOffset
        results {
          id
          name
          description
          created
          modified
          visibility
          address {
            locality
            administrativeArea
            countryName
          }
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.models;
}

/**
 * Get detailed information about a specific model
 */
export async function getModelDetails(
  credentials: MatterportCredentials,
  modelId: string
): Promise<MatterportModel> {
  const query = `
    query {
      model(id: "${modelId}") {
        id
        name
        description
        created
        modified
        visibility
        address {
          streetAddressLines
          locality
          administrativeArea
          countryName
          postalCode
        }
        assets {
          panos { count }
          photos { count }
          meshes { count }
        }
        floors {
          id
          label
          sequence
        }
        rooms {
          id
          label
          floor { id label }
        }
        mattertags {
          id
          label
          description
          mediaType
          position { x y z }
        }
        sweeps {
          id
          position { x y z }
          rotation { x y z }
          floor { id }
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.model;
}

/**
 * Get model with only basic info (for quick loading)
 */
export async function getModelBasic(
  credentials: MatterportCredentials,
  modelId: string
): Promise<MatterportModelSummary> {
  const query = `
    query {
      model(id: "${modelId}") {
        id
        name
        description
        created
        modified
        visibility
        address {
          locality
          administrativeArea
          countryName
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.model;
}

/**
 * Get floors for a specific model
 */
export async function getModelFloors(
  credentials: MatterportCredentials,
  modelId: string
): Promise<{ id: string; label: string; sequence: number }[]> {
  const query = `
    query {
      model(id: "${modelId}") {
        floors {
          id
          label
          sequence
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.model.floors || [];
}

/**
 * Get rooms for a specific model
 */
export async function getModelRooms(
  credentials: MatterportCredentials,
  modelId: string
): Promise<{ id: string; label: string; floor?: { id: string; label: string } }[]> {
  const query = `
    query {
      model(id: "${modelId}") {
        rooms {
          id
          label
          floor { id label }
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.model.rooms || [];
}

/**
 * Get sweeps (scan points/panoramas) for a specific model
 */
export async function getModelSweeps(
  credentials: MatterportCredentials,
  modelId: string
): Promise<{ id: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; floor?: { id: string } }[]> {
  const query = `
    query {
      model(id: "${modelId}") {
        sweeps {
          id
          position { x y z }
          rotation { x y z }
          floor { id }
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.model.sweeps || [];
}

/**
 * Get MatterTags for a specific model
 */
export async function getModelMatterTags(
  credentials: MatterportCredentials,
  modelId: string
): Promise<{ id: string; label: string; description?: string; mediaType?: string; position?: { x: number; y: number; z: number } }[]> {
  const query = `
    query {
      model(id: "${modelId}") {
        mattertags {
          id
          label
          description
          mediaType
          position { x y z }
        }
      }
    }
  `;

  const data = await executeGraphQL(credentials, query);
  return data.model.mattertags || [];
}
