import { TrelloConfig, Customer, TrelloList, TrelloCard, TrelloMember, TrelloAction, TrelloAttachment, Appointment } from '../types';
import { format } from 'date-fns';

const BASE_URL = 'https://api.trello.com/1';

const getAuthParams = (config: TrelloConfig) => 
  `key=${config.apiKey}&token=${config.token}`;

// Helper para gerar URL do Avatar (Exportado internamente e reutilizado)
const getAvatarUrl = (memberId: string, avatarHash: string | null | undefined) => {
  if (!avatarHash) return null;
  return `https://trello-members.s3.amazonaws.com/${memberId}/${avatarHash}/170.png`;
};

export const checkTrelloCredentials = async (config: TrelloConfig): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL}/members/me?${getAuthParams(config)}`);
    return response.ok;
  } catch {
    return false;
  }
};

// --- NOVA FUNÇÃO: Baixar anexo autenticado como Blob ---
export const fetchAuthenticatedAttachment = async (config: TrelloConfig, url: string): Promise<string> => {
  try {
    // Se a URL for do Trello, anexamos as credenciais. Se for externa (ex: Google Drive), tentamos direto.
    let fetchUrl = url;
    if (url.includes('trello.com') || url.includes('trello-attachments')) {
        const separator = url.includes('?') ? '&' : '?';
        fetchUrl = `${url}${separator}${getAuthParams(config)}`;
    }
    
    const response = await fetch(fetchUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to load attachment: ${response.statusText}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Error fetching attachment:", error);
    throw error;
  }
};

export const findCardByPlate = async (config: TrelloConfig, plate: string): Promise<any | null> => {
  try {
    const listIds = [config.listId];
    if (config.agendamentoListId) {
      listIds.push(config.agendamentoListId);
    }

    const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalizedPlate) return null;

    for (const listId of listIds) {
      const response = await fetch(`${BASE_URL}/lists/${listId}/cards?${getAuthParams(config)}`);
      
      if (response.ok) {
        const cards = await response.json();
        const found = cards.find((card: any) => card.name.toUpperCase().includes(normalizedPlate));
        if (found) return found;
      }
    }
    
    return null;
  } catch (error: any) {
    console.error("Error finding card:", error);
    throw new Error(error.message || "Failed to connect to Trello");
  }
};

// --- NOVA FUNÇÃO: Buscar Cartões Arquivados (Genérica) ---
export const searchArchivedCards = async (config: TrelloConfig, queryTerm: string): Promise<TrelloCard[]> => {
  try {
    // 1. Precisamos do ID do Board. Vamos tentar obter através da lista configurada.
    const listResp = await fetch(`${BASE_URL}/lists/${config.listId}?fields=idBoard&${getAuthParams(config)}`);
    if (!listResp.ok) throw new Error("Erro ao identificar quadro.");
    const listData = await listResp.json();
    const boardId = listData.idBoard;

    // 2. Usar a API de Search do Trello
    // query: termo de busca (placa, nome, cpf, etc)
    const query = encodeURIComponent(queryTerm);
    const searchUrl = `${BASE_URL}/search?query=${query}&idBoards=${boardId}&modelTypes=cards&card_fields=all&cards_limit=20&partial=true&${getAuthParams(config)}`;
    
    const response = await fetch(searchUrl);
    if (!response.ok) throw new Error("Erro na busca do Trello.");
    
    const data = await response.json();
    
    // Filtra apenas os que estão fechados (arquivados)
    const archivedCards = data.cards.filter((c: any) => c.closed === true);

    return archivedCards.map((card: any) => ({
      ...card,
      members: [], 
      checklists: [] 
    }));

  } catch (error) {
    console.error("Erro ao buscar arquivados:", error);
    return [];
  }
};

// --- NOVA FUNÇÃO: Parsear Descrição para Objeto Customer ---
export const parseCustomerFromDescription = (description: string): Partial<Customer> => {
  const customer: Partial<Customer> = {};
  
  // Helper simples de regex para extrair valor após "**Chave:**"
  const extract = (key: string) => {
    // Procura por "**Chave:** valor" apenas no início de uma linha
    const regex = new RegExp(`^\\*\\*${key}:\\*\\*\\s*(.*)$`, 'mi');
    const match = description.match(regex);
    if (!match) return '';
    const value = match[1].trim();
    // Se o valor capturado começar com outra chave (ex: **Endereço), ignoramos para evitar erro de parse
    if (value.startsWith('**')) return '';
    return value;
  };

  customer.name = extract('Cliente');
  customer.cpf = extract('CPF');
  customer.phone = extract('Telefone');
  customer.email = extract('E-mail');
  
  // Endereço e Número
  const addressFull = extract('Endereço');
  
  // No createCard atual: "**Endereço:** ${customer.address}, Nº ${customer.addressNumber}"
  if (addressFull.includes(', Nº')) {
      const parts = addressFull.split(', Nº');
      customer.address = parts[0].trim();
      customer.addressNumber = parts[1].trim();
  } else {
      customer.address = addressFull;
      customer.addressNumber = '';
  }

  customer.cep = extract('CEP');
  
  // Não recuperamos a Queixa antiga, pois é um novo serviço
  customer.issueDescription = ''; 

  return customer;
};

// Itens padrão definidos como constantes para reuso
const ITEMS_ENTRADA = [
  "Etiqueta da chave do carro",
  "Proteger banco e volante",
  "Gravar/Tirar fotos de riscos, defeitos, peças faltando",
  "Passar scanner",
  "Tirar foto do Km",
  "Testar bateria"
];

const ITEMS_FINALIZACAO = [
  "Etiqueta de fluído/óleo",
  "Adesivo",
  "Cheirinho",
  "Retirar proteção"
];

// Helper interno para criar checklists
const createChecklistWithItems = async (config: TrelloConfig, cardId: string, checklistName: string, items: string[]) => {
  try {
    // 1. Criar o Checklist
    const clUrl = `${BASE_URL}/checklists?idCard=${cardId}&name=${encodeURIComponent(checklistName)}&${getAuthParams(config)}`;
    const clResponse = await fetch(clUrl, { method: 'POST' });
    
    if (!clResponse.ok) {
      console.warn(`Falha ao criar checklist ${checklistName}`);
      return;
    }

    const checklistData = await clResponse.json();

    // 2. Adicionar itens (em paralelo para ser mais rápido)
    const itemPromises = items.map(item => {
      const itemUrl = `${BASE_URL}/checklists/${checklistData.id}/checkItems?name=${encodeURIComponent(item)}&${getAuthParams(config)}`;
      return fetch(itemUrl, { method: 'POST' });
    });

    await Promise.all(itemPromises);
  } catch (error) {
    console.error(`Erro ao processar checklist ${checklistName}:`, error);
    throw error;
  }
};

// Função pública para criar checklists manualmente caso não existam
export const createStandardChecklist = async (config: TrelloConfig, cardId: string, type: 'Entrada' | 'Finalização'): Promise<void> => {
  const items = type === 'Entrada' ? ITEMS_ENTRADA : ITEMS_FINALIZACAO;
  await createChecklistWithItems(config, cardId, type, items);
};

export const attachLink = async (config: TrelloConfig, cardId: string, url: string, name?: string): Promise<void> => {
  const params = new URLSearchParams({
    key: config.apiKey,
    token: config.token,
    url: url
  });
  
  if (name) {
    params.append('name', name);
  }

  const response = await fetch(`${BASE_URL}/cards/${cardId}/attachments`, {
    method: 'POST',
    body: params
  });

  if (!response.ok) {
    throw new Error("Falha ao anexar link.");
  }
};

export const uploadAttachment = async (config: TrelloConfig, cardId: string, file: Blob, fileName: string): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('key', config.apiKey);
  formData.append('token', config.token);

  const url = `${BASE_URL}/cards/${cardId}/attachments`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error("Falha ao enviar anexo.");
  }
};

export const getCardsFromList = async (config: TrelloConfig, listId: string): Promise<TrelloCard[]> => {
  const url = `${BASE_URL}/lists/${listId}/cards?${getAuthParams(config)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao buscar cartões da lista.");
  return await response.json();
};

export const parseAppointmentFromCard = (card: TrelloCard): Appointment => {
  // O nome do card é "Modelo - PLACA - Nome"
  const nameParts = card.name.split(' - ');
  const vehicleModel = nameParts[0] || '';
  const plate = nameParts[1] || '';
  const customerName = nameParts[2] || '';

  // A descrição contém os detalhes
  const desc = card.desc || '';
  const extract = (key: string) => {
    // Procura por "**Chave:** valor" apenas no início de uma linha
    const regex = new RegExp(`^\\*\\*${key}:\\*\\*\\s*(.*)$`, 'mi');
    const match = desc.match(regex);
    if (!match) return '';
    const value = match[1].trim();
    // Se o valor capturado começar com outra chave (ex: **Endereço), ignoramos para evitar erro de parse
    if (value.startsWith('**')) return '';
    return value;
  };

  // Extrair o título do agendamento da descrição
  // No createCard: `Agendamento: ${appointment.title}\nNotas: ${appointment.notes}`
  const agendaMatch = desc.match(/^Agendamento:\s*(.*)$/m);
  const title = agendaMatch ? agendaMatch[1].trim() : (card.name || 'Sem título');

  const notesMatch = desc.match(/^Notas:\s*([\s\S]*)$/m);
  const notes = notesMatch ? notesMatch[1].trim() : '';

  const date = card.due ? new Date(card.due) : new Date();
  const time = card.due ? format(new Date(card.due), 'HH:mm') : '09:00';

  const phone = extract('Telefone');
  const email = extract('E-mail');
  const customerNameFromDesc = extract('Cliente');

  return {
    id: card.id,
    title,
    customerName: customerNameFromDesc || nameParts[2] || '',
    phone,
    email,
    vehicleModel,
    plate,
    date,
    time,
    notes,
    status: 'scheduled',
    trelloCardId: card.id
  };
};

export const createCard = async (config: TrelloConfig, customer: Customer, targetListId?: string, due?: string): Promise<string> => {
  const firstName = customer.name?.trim().split(' ')[0] || 'Cliente';
  const vehicle = customer.vehicleModel?.trim() || 'Veículo';
  const plate = customer.plate?.trim().toUpperCase() || 'SEM PLACA';
  const title = `${vehicle} - ${plate} - ${firstName}`;
  
  const desc = `**Cliente:** ${customer.name || ''}
**CPF:** ${customer.cpf || ''}
**Telefone:** ${customer.phone || ''}
**E-mail:** ${customer.email || ''}
**Endereço:** ${customer.address || ''}, Nº ${customer.addressNumber || ''}
**CEP:** ${customer.cep || ''}
 
### Queixa do Cliente
${customer.issueDescription || ''}`;

  const url = `${BASE_URL}/cards?key=${config.apiKey}&token=${config.token}`;
  
  const body: any = {
    idList: targetListId || config.listId,
    name: title,
    desc: desc,
    pos: 'top'
  };

  if (due) {
    body.due = due;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create card: [${response.status}] ${errorText}`);
  }

  // Obter o ID do card recém criado para adicionar os checklists
  const cardData = await response.json();
  const cardId = cardData.id;

  // Se for para a lista principal (não agendamento), adiciona checklists
  if (!targetListId || targetListId === config.listId) {
    // Checklist 1: Entrada
    await createChecklistWithItems(config, cardId, "Entrada", ITEMS_ENTRADA);

    // Checklist 2: Finalização
    await createChecklistWithItems(config, cardId, "Finalização", ITEMS_FINALIZACAO);
  }

  return cardId;
};

export const updateCardFull = async (config: TrelloConfig, cardId: string, customer: Customer, targetListId?: string, due?: string): Promise<void> => {
  const firstName = customer.name?.trim().split(' ')[0] || 'Cliente';
  const vehicle = customer.vehicleModel?.trim() || 'Veículo';
  const plate = customer.plate?.trim().toUpperCase() || 'SEM PLACA';
  const title = `${vehicle} - ${plate} - ${firstName}`;
  
  const desc = `**Cliente:** ${customer.name || ''}
**CPF:** ${customer.cpf || ''}
**Telefone:** ${customer.phone || ''}
**E-mail:** ${customer.email || ''}
**Endereço:** ${customer.address || ''}, Nº ${customer.addressNumber || ''}
**CEP:** ${customer.cep || ''}

### Queixa do Cliente
${customer.issueDescription || ''}`;

  const url = `${BASE_URL}/cards/${cardId}?${getAuthParams(config)}`;
  
  const body: any = {
    name: title,
    desc: desc
  };

  if (targetListId) {
    body.idList = targetListId;
  }

  if (due) {
    body.due = due;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar o cartão.");
  }

  // Se moveu para a lista principal, garante que tem os checklists
  if (targetListId === config.listId) {
     // Verifica se já tem checklists (simplificado: tenta criar, se falhar ou duplicar o Trello lida ou ignoramos erro silencioso)
     try {
        await createChecklistWithItems(config, cardId, "Entrada", ITEMS_ENTRADA);
        await createChecklistWithItems(config, cardId, "Finalização", ITEMS_FINALIZACAO);
     } catch (e) {
        console.warn("Checklists may already exist", e);
     }
  }
};

export const updateCard = async (config: TrelloConfig, cardId: string, customer: Customer): Promise<string> => {
  const commentText = `🔄 **Nova Entrada de Veículo**

**Queixa:** ${customer.issueDescription}
**Data:** ${new Date().toLocaleDateString('pt-BR')}`;

  const url = `${BASE_URL}/cards/${cardId}/actions/comments?key=${config.apiKey}&token=${config.token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: commentText
    })
  });

  if (!response.ok) {
     const errorText = await response.text().catch(() => 'Unknown error');
     throw new Error(`Failed to update card: [${response.status}] ${errorText}`);
  }

  return cardId;
};

export const updateCardDescription = async (config: TrelloConfig, cardId: string, description: string): Promise<void> => {
  const url = `${BASE_URL}/cards/${cardId}?${getAuthParams(config)}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      desc: description
    })
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar a descrição do cartão.");
  }
};

export const archiveCard = async (config: TrelloConfig, cardId: string): Promise<void> => {
  // api.trello.com/1/cards/{id}?closed=true
  const url = `${BASE_URL}/cards/${cardId}?${getAuthParams(config)}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      closed: true
    })
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.warn(`Card ${cardId} not found, it might have been already deleted.`);
      return;
    }
    const text = await response.text().catch(() => '');
    throw new Error(`Falha ao arquivar o cartão: ${response.status} ${text}`);
  }
};

// --- Novas funções para Detalhes do Card (Comentários e Anexos) ---

export const getCardDetails = async (config: TrelloConfig, cardId: string): Promise<{ actions: TrelloAction[], attachments: TrelloAttachment[] }> => {
  // Busca actions (comentários) e attachments
  const url = `${BASE_URL}/cards/${cardId}?actions=commentCard&attachments=true&actions_limit=50&${getAuthParams(config)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error("Falha ao carregar detalhes do cartão.");
  }

  const data = await response.json();

  // Processar Actions (Comentários)
  const actions: TrelloAction[] = (data.actions || []).map((action: any) => ({
    id: action.id,
    idMemberCreator: action.idMemberCreator,
    data: action.data,
    type: action.type,
    date: action.date,
    memberCreator: {
      id: action.memberCreator.id,
      fullName: action.memberCreator.fullName,
      avatarHash: action.memberCreator.avatarHash,
      avatarUrl: getAvatarUrl(action.memberCreator.id, action.memberCreator.avatarHash)
    }
  }));

  // Processar Anexos
  const attachments: TrelloAttachment[] = (data.attachments || []).map((att: any) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    mimeType: att.mimeType,
    previews: att.previews
  }));

  return { actions, attachments };
};

export const addCardComment = async (config: TrelloConfig, cardId: string, text: string): Promise<TrelloAction> => {
  const url = `${BASE_URL}/cards/${cardId}/actions/comments?text=${encodeURIComponent(text)}&${getAuthParams(config)}`;
  
  const response = await fetch(url, { method: 'POST' });

  if (!response.ok) {
    throw new Error("Falha ao enviar comentário.");
  }

  const data = await response.json();
  
  // Retorna formato compatível com TrelloAction
  return {
    id: data.id,
    idMemberCreator: data.idMemberCreator,
    data: data.data,
    type: data.type,
    date: data.date,
    memberCreator: {
      id: data.memberCreator.id,
      fullName: data.memberCreator.fullName,
      avatarHash: data.memberCreator.avatarHash,
      avatarUrl: getAvatarUrl(data.memberCreator.id, data.memberCreator.avatarHash)
    }
  };
};

export const updateAction = async (config: TrelloConfig, actionId: string, text: string): Promise<void> => {
  const url = `${BASE_URL}/actions/${actionId}?text=${encodeURIComponent(text)}&${getAuthParams(config)}`;
  const response = await fetch(url, { method: 'PUT' });
  if (!response.ok) throw new Error("Falha ao atualizar comentário.");
};

export const deleteAction = async (config: TrelloConfig, actionId: string): Promise<void> => {
  const url = `${BASE_URL}/actions/${actionId}?${getAuthParams(config)}`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) throw new Error("Falha ao excluir comentário.");
};


// --- Funções do Pátio ---

export const getBoardData = async (config: TrelloConfig): Promise<{ lists: TrelloList[], cards: TrelloCard[] }> => {
  // 1. Primeiro precisamos descobrir o ID do Board a partir da Lista configurada
  const listResp = await fetch(`${BASE_URL}/lists/${config.listId}?fields=idBoard&${getAuthParams(config)}`);
  if (!listResp.ok) throw new Error("Falha ao identificar o quadro do Trello.");
  const listData = await listResp.json();
  const boardId = listData.idBoard;

  // 2. Buscar todas as listas do quadro
  const listsResp = await fetch(`${BASE_URL}/boards/${boardId}/lists?${getAuthParams(config)}`);
  if (!listsResp.ok) throw new Error("Falha ao buscar listas do quadro.");
  const lists = await listsResp.json();

  // 3. Buscar todos os cards do quadro com membros E CHECKLISTS
  // Adicionado parameters: checklists=all
  const cardsResp = await fetch(`${BASE_URL}/boards/${boardId}/cards?members=true&checklists=all&${getAuthParams(config)}`);
  if (!cardsResp.ok) throw new Error("Falha ao buscar cartões do quadro.");
  
  const rawCards = await cardsResp.json();

  // Mapear cards para incluir URL do avatar e estrutura limpa de checklists
  const cards = rawCards.map((card: any) => ({
    ...card,
    members: card.members?.map((m: any) => ({
      id: m.id,
      fullName: m.fullName,
      username: m.username,
      avatarUrl: getAvatarUrl(m.id, m.avatarHash)
    })),
    checklists: card.checklists?.map((cl: any) => ({
      id: cl.id,
      name: cl.name,
      checkItems: cl.checkItems?.map((ci: any) => ({
        id: ci.id,
        name: ci.name,
        state: ci.state,
        pos: ci.pos
      })).sort((a: any, b: any) => a.pos - b.pos)
    }))
  }));

  return { lists, cards };
};

export const getBoardMembers = async (config: TrelloConfig): Promise<TrelloMember[]> => {
  // 1. Obter ID do Board
  const listResp = await fetch(`${BASE_URL}/lists/${config.listId}?fields=idBoard&${getAuthParams(config)}`);
  if (!listResp.ok) throw new Error("Falha ao identificar o quadro.");
  const listData = await listResp.json();
  const boardId = listData.idBoard;

  // 2. Buscar membros do Board
  const resp = await fetch(`${BASE_URL}/boards/${boardId}/members?${getAuthParams(config)}`);
  if (!resp.ok) throw new Error("Falha ao buscar membros.");
  
  const rawMembers = await resp.json();
  
  // Mapear para incluir avatarUrl
  return rawMembers.map((m: any) => ({
    id: m.id,
    fullName: m.fullName,
    username: m.username,
    avatarUrl: getAvatarUrl(m.id, m.avatarHash)
  }));
};

export const assignMemberToCard = async (config: TrelloConfig, cardId: string, memberId: string): Promise<void> => {
  const url = `${BASE_URL}/cards/${cardId}/idMembers?value=${memberId}&${getAuthParams(config)}`;
  
  const response = await fetch(url, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error("Falha ao atribuir mecânico.");
  }
};

// --- NOVA FUNÇÃO: Remover membro do card ---
export const removeMemberFromCard = async (config: TrelloConfig, cardId: string, memberId: string): Promise<void> => {
  const url = `${BASE_URL}/cards/${cardId}/idMembers/${memberId}?${getAuthParams(config)}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error("Falha ao remover mecânico.");
  }
};

export const moveCardToColumn = async (config: TrelloConfig, cardId: string, newListId: string): Promise<void> => {
  const url = `${BASE_URL}/cards/${cardId}?idList=${newListId}&${getAuthParams(config)}`;
  
  const response = await fetch(url, {
    method: 'PUT'
  });

  if (!response.ok) {
    throw new Error("Falha ao mover o cartão.");
  }
};

export const toggleCheckItem = async (config: TrelloConfig, cardId: string, checkItemId: string, state: 'complete' | 'incomplete'): Promise<void> => {
  // api.trello.com/1/cards/{idCard}/checkItem/{idCheckItem}?state={value}
  const url = `${BASE_URL}/cards/${cardId}/checkItem/${checkItemId}?state=${state}&${getAuthParams(config)}`;
  
  const response = await fetch(url, {
    method: 'PUT'
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar item do checklist.");
  }
};